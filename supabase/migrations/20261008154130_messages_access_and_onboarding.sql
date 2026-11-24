-- Custom sessions are checked by Edge Functions; these tables/RPCs are service-only.
create schema if not exists messenger_private;
revoke all on schema messenger_private from public, anon, authenticated;

alter table public.products
  add column after_access_enabled boolean not null default false,
  add column after_access_url text,
  add constraint products_after_access_url_check check (
    not after_access_enabled or (
      after_access_url is not null and length(after_access_url) <= 2048
      and after_access_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
    )
  );

create table public.messenger_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  install_hint_seen_at timestamptz
);
alter table public.messenger_preferences enable row level security;
revoke all on public.messenger_preferences from public, anon, authenticated;
grant all on public.messenger_preferences to service_role;

create function public.claim_messenger_install_hint(p_profile uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.messenger_preferences(profile_id,install_hint_seen_at) values(p_profile,now())
  on conflict(profile_id) do update set install_hint_seen_at=now()
  where public.messenger_preferences.install_hint_seen_at is null;
  return found;
end;
$$;
revoke all on function public.claim_messenger_install_hint(uuid) from public,anon,authenticated;
grant execute on function public.claim_messenger_install_hint(uuid) to service_role;

alter table public.direct_messages add column read_at timestamptz;
-- Legacy counters refer to the most recent messages from each side.
with ranked as (
  select m.id, m.sender, m.thread_id, row_number() over(partition by m.thread_id,m.sender order by m.created_at desc,m.id desc) as position
  from public.direct_messages m
)
update public.direct_messages m set read_at=now()
from ranked r join public.direct_threads t on t.id=r.thread_id where m.id=r.id
and r.position > case when r.sender='creator' then t.unread_for_buyer else t.unread_for_creator end;
-- Counters below are based on message rows, including legacy unread messages.
update public.direct_threads t set
  unread_for_creator = (select count(*) from public.direct_messages m where m.thread_id=t.id and m.sender='buyer' and m.read_at is null),
  unread_for_buyer = (select count(*) from public.direct_messages m where m.thread_id=t.id and m.sender='creator' and m.read_at is null);

create function messenger_private.direct_message_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.direct_threads set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(nullif(new.text, ''), 'Вложение'), 200),
    unread_for_buyer = unread_for_buyer + case when new.sender='creator' then 1 else 0 end,
    unread_for_creator = unread_for_creator + case when new.sender='buyer' then 1 else 0 end
  where id = new.thread_id;
  return new;
end;
$$;
create trigger direct_message_inserted after insert on public.direct_messages
for each row execute function messenger_private.direct_message_inserted();

create function public.mark_direct_messages_read(p_thread uuid, p_side text, p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_side not in ('creator', 'buyer') then raise exception 'Invalid side'; end if;
  -- Same lock order as the insert trigger; a newly arrived, unseen message stays unread.
  perform 1 from public.direct_threads where id=p_thread for update;
  update public.direct_messages set read_at=now()
  where thread_id=p_thread and id=any(p_ids) and sender<>p_side and read_at is null;
  get diagnostics n = row_count;
  update public.direct_threads set
    unread_for_creator = greatest(0, unread_for_creator - case when p_side='creator' then n else 0 end),
    unread_for_buyer = greatest(0, unread_for_buyer - case when p_side='buyer' then n else 0 end)
  where id=p_thread;
end;
$$;
revoke all on function public.mark_direct_messages_read(uuid,text,uuid[]) from public, anon, authenticated;
grant execute on function public.mark_direct_messages_read(uuid,text,uuid[]) to service_role;

alter table public.simple_purchases add column chat_grant_version integer not null default 0;
create table public.direct_access_events (
  purchase_id uuid not null references public.simple_purchases(id) on delete cascade,
  grant_version integer not null,
  group_url text,
  delivered_at timestamptz,
  primary key (purchase_id, grant_version)
);
alter table public.direct_access_events enable row level security;
revoke all on public.direct_access_events from public, anon, authenticated;
grant all on public.direct_access_events to service_role;

create function messenger_private.purchase_access_open(p public.simple_purchases) returns boolean
language sql stable set search_path = '' as $$
  select p.status='completed' and p.buyer_profile_id is not null and
    case when exists (select 1 from public.products prod join public.categories c on c.id=prod.category_id where prod.id=p.product_id and c.slug='subscriptions')
    then exists (select 1 from public.subscriptions s where s.product_id=p.product_id and s.buyer_profile_id=p.buyer_profile_id and s.status in ('active','cancelled') and s.current_period_end>now())
    when coalesce(p.is_trial,false) then p.trial_ends_at>now()
    else p.access_expires_at is null or p.access_expires_at>now() end;
$$;

create function messenger_private.version_access_grant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status='completed' then
    if tg_op='INSERT' then new.chat_grant_version:=1;
    elsif old.status<>'completed' or (
      not coalesce(messenger_private.purchase_access_open(old),false)
      and (new.access_expires_at is distinct from old.access_expires_at or new.trial_ends_at is distinct from old.trial_ends_at or new.is_trial is distinct from old.is_trial)
    ) then new.chat_grant_version:=old.chat_grant_version+1;
    else new.chat_grant_version:=old.chat_grant_version;
    end if;
  elsif tg_op='UPDATE' then new.chat_grant_version:=old.chat_grant_version;
  end if;
  return new;
end;
$$;
create trigger version_access_grant before insert or update on public.simple_purchases
for each row execute function messenger_private.version_access_grant();

create function messenger_private.deliver_access_event(p_purchase uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.simple_purchases; e public.direct_access_events; seller uuid; thread uuid;
begin
  select * into p from public.simple_purchases where id=p_purchase;
  if not coalesce(messenger_private.purchase_access_open(p),false) then return; end if;
  select creator_account_id into seller from public.products where id=p.product_id;
  if seller is null then return; end if;
  -- Every grant creates the pair, even without a group invitation.
  insert into public.direct_threads(creator_account_id,buyer_profile_id) values(seller,p.buyer_profile_id)
  on conflict (creator_account_id,buyer_profile_id) do nothing;
  select id into thread from public.direct_threads where creator_account_id=seller and buyer_profile_id=p.buyer_profile_id;
  select * into e from public.direct_access_events where purchase_id=p.id and grant_version=p.chat_grant_version for update;
  if not found or e.delivered_at is not null then return; end if;
  if e.group_url is not null then
    insert into public.direct_messages(thread_id,sender,text) values(thread,'creator',
      'Здравствуйте! Это ссылка на вступление в нашу группу: ' || e.group_url);
  end if;
  update public.direct_access_events set delivered_at=now() where purchase_id=e.purchase_id and grant_version=e.grant_version;
end;
$$;
create function messenger_private.purchase_chat_granted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='completed' and new.buyer_profile_id is not null then
    if new.chat_grant_version>0 then
      insert into public.direct_access_events(purchase_id,grant_version,group_url)
      select new.id,new.chat_grant_version,case when after_access_enabled then after_access_url end
      from public.products where id=new.product_id
      on conflict do nothing;
    end if;
    perform messenger_private.deliver_access_event(new.id);
  end if;
  return new;
end;
$$;
create trigger purchase_chat_granted after insert or update on public.simple_purchases
for each row execute function messenger_private.purchase_chat_granted();

create function messenger_private.subscription_chat_granted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.status in ('active','cancelled') and new.current_period_end>now() then
    for p in select id from public.simple_purchases where product_id=new.product_id and buyer_profile_id=new.buyer_profile_id and status='completed'
    loop perform messenger_private.deliver_access_event(p.id); end loop;
  end if;
  return new;
end;
$$;
create trigger subscription_chat_granted after insert or update on public.subscriptions
for each row execute function messenger_private.subscription_chat_granted();

-- Backfill pair history only. Never send invitations for historical purchases.
insert into public.direct_threads(creator_account_id,buyer_profile_id)
select distinct prod.creator_account_id,p.buyer_profile_id
from public.simple_purchases p join public.products prod on prod.id=p.product_id
where p.status in ('completed','revoked') and p.buyer_profile_id is not null and prod.creator_account_id is not null
on conflict (creator_account_id,buyer_profile_id) do nothing;

-- The campaign is deliberately disabled. Review, then explicitly activate/run it.
create table public.support_campaigns (key text primary key, enabled boolean not null default false);
insert into public.support_campaigns(key) values('support_welcome_v1');
create table public.support_campaign_deliveries (
  campaign_key text not null references public.support_campaigns(key),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key(campaign_key,profile_id)
);
create index support_campaign_deliveries_profile_idx on public.support_campaign_deliveries(profile_id);
alter table public.support_campaigns enable row level security;
alter table public.support_campaign_deliveries enable row level security;
revoke all on public.support_campaigns,public.support_campaign_deliveries from public,anon,authenticated;
grant all on public.support_campaigns,public.support_campaign_deliveries to service_role;

create function public.deliver_support_welcome(p_profile uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare p public.profiles; ref text; kind text; thread uuid;
begin
  if not exists(select 1 from public.support_campaigns where key='support_welcome_v1' and enabled) then return false; end if;
  select * into p from public.profiles where id=p_profile and type in ('buyer','creator','school') and auth_user_id is not null and not is_demo;
  if not found then return false; end if;
  if p.type in ('creator','school') then
    select login into ref from public.creator_accounts where profile_id=p.id;
    kind:='creator';
  else
    ref:=p.id::text;
    kind:=case when exists(select 1 from public.product_teachers where lower(teacher_name)=lower(p.display_name)) then 'teacher' else 'student' end;
  end if;
  if ref is null then return false; end if;
  insert into public.support_campaign_deliveries(campaign_key,profile_id) values('support_welcome_v1',p.id) on conflict do nothing;
  if not found then return false; end if;
  insert into public.support_threads(user_type,user_ref,display_name) values(kind,ref,coalesce(p.display_name,'Пользователь'))
    on conflict(user_type,user_ref) do nothing;
  select id into thread from public.support_threads where user_type=kind and user_ref=ref for update;
  insert into public.support_messages(thread_id,sender,text) values(thread,'moderator',E'Здравствуйте, рады вас видеть!\n\nПишите что можно улучшить или добавить.\n\nМы с радостью исправим это!');
  update public.support_threads set unread_for_user=unread_for_user+1,last_message_at=now(),last_message_preview='Здравствуйте, рады вас видеть!' where id=thread;
  return true;
end;
$$;
revoke all on function public.deliver_support_welcome(uuid) from public,anon,authenticated;
grant execute on function public.deliver_support_welcome(uuid) to service_role;

create function messenger_private.new_profile_welcome() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='profiles' then
    perform public.deliver_support_welcome(new.id);
  else
    perform public.deliver_support_welcome(new.profile_id);
  end if;
  return new;
end;
$$;
create trigger new_profile_welcome after insert on public.profiles for each row execute function messenger_private.new_profile_welcome();
create trigger new_account_welcome after insert or update of profile_id on public.creator_accounts for each row execute function messenger_private.new_profile_welcome();

revoke all on all functions in schema messenger_private from public,anon,authenticated;
-- Service role needs these invoker trigger helpers; schema stays unexposed by PostgREST.
grant usage on schema messenger_private to service_role;
grant execute on all functions in schema messenger_private to service_role;
