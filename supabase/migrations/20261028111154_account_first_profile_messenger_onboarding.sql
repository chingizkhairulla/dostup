-- One onboarding per auth identity, attached to its first profile.
-- Existing identities are registered without sending historical welcome messages.
create table public.messenger_account_state (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  first_profile_id uuid unique references public.profiles(id) on delete set null,
  install_hint_seen_at timestamptz,
  welcome_pending boolean not null default true,
  welcome_delivered_at timestamptz
);
alter table public.messenger_account_state enable row level security;
revoke all on public.messenger_account_state from public, anon, authenticated;
grant all on public.messenger_account_state to service_role;

insert into public.messenger_account_state
  (auth_user_id, first_profile_id, install_hint_seen_at, welcome_pending, welcome_delivered_at)
select distinct on (p.auth_user_id)
  p.auth_user_id, p.id,
  (select min(mp.install_hint_seen_at)
   from public.profiles sibling
   join public.messenger_preferences mp on mp.profile_id=sibling.id
   where sibling.auth_user_id=p.auth_user_id),
  false,
  (select min(d.delivered_at)
   from public.profiles sibling
   join public.support_campaign_deliveries d on d.profile_id=sibling.id
   where sibling.auth_user_id=p.auth_user_id and d.campaign_key='support_welcome_v1')
from public.profiles p
where p.auth_user_id is not null and p.type in ('buyer','creator','school')
order by p.auth_user_id, p.created_at, p.id;

-- The old opt-in bulk campaign is retired. New first profiles are welcomed by triggers.
update public.support_campaigns set enabled=false where key='support_welcome_v1';

create or replace function public.claim_messenger_install_hint(p_profile uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.messenger_account_state a set install_hint_seen_at=now()
  from public.profiles p
  where p.id=p_profile and p.type in ('buyer','creator','school') and not p.is_demo
    and a.auth_user_id=p.auth_user_id and a.first_profile_id=p.id
    and a.install_hint_seen_at is null;
  return found;
end;
$$;

create or replace function public.deliver_support_welcome(p_profile uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  p public.profiles;
  state public.messenger_account_state;
  ref text;
  kind text;
  thread uuid;
begin
  select * into p from public.profiles
  where id=p_profile and type in ('buyer','creator','school')
    and auth_user_id is not null and not is_demo;
  if not found then return false; end if;

  -- Serializes retries across tabs/devices and concurrent profile/account creation.
  select * into state from public.messenger_account_state
  where auth_user_id=p.auth_user_id for update;
  if not found or state.first_profile_id is distinct from p.id
    or not state.welcome_pending or state.welcome_delivered_at is not null then
    return false;
  end if;

  if p.type in ('creator','school') then
    select login into ref from public.creator_accounts where profile_id=p.id;
    kind:='creator';
  else
    ref:=p.id::text;
    kind:=case when exists(
      select 1 from public.product_teachers where lower(teacher_name)=lower(p.display_name)
    ) then 'teacher' else 'student' end;
  end if;
  -- Seller profile precedes its creator account: the account trigger retries delivery.
  if ref is null then return false; end if;

  insert into public.support_threads(user_type,user_ref,display_name)
  values(kind,ref,coalesce(p.display_name,'Пользователь'))
  on conflict(user_type,user_ref) do nothing;
  select id into thread from public.support_threads
  where user_type=kind and user_ref=ref for update;
  insert into public.support_messages(thread_id,sender,text)
  values(thread,'moderator',E'Здравствуйте, рады вас видеть!\n\nПишите что можно улучшить или добавить.\n\nМы с радостью возьмемся за это!');
  update public.support_threads set
    unread_for_user=unread_for_user+1,
    last_message_at=now(),
    last_message_preview='Здравствуйте, рады вас видеть!'
  where id=thread;
  update public.messenger_account_state
  set welcome_delivered_at=now(), welcome_pending=false
  where auth_user_id=p.auth_user_id;
  return true;
end;
$$;

create or replace function messenger_private.new_profile_welcome() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='profiles' then
    if new.auth_user_id is not null and new.type in ('buyer','creator','school') then
      -- The unique auth identity picks exactly one first profile, even on simultaneous inserts.
      insert into public.messenger_account_state(auth_user_id,first_profile_id)
      values(new.auth_user_id,new.id) on conflict(auth_user_id) do nothing;
      perform public.deliver_support_welcome(new.id);
    end if;
  else
    perform public.deliver_support_welcome(new.profile_id);
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE retains ACLs; make the service-only boundary explicit.
revoke all on function public.claim_messenger_install_hint(uuid) from public,anon,authenticated;
revoke all on function public.deliver_support_welcome(uuid) from public,anon,authenticated;
revoke all on function messenger_private.new_profile_welcome() from public,anon,authenticated;
grant execute on function public.claim_messenger_install_hint(uuid) to service_role;
grant execute on function public.deliver_support_welcome(uuid) to service_role;
grant execute on function messenger_private.new_profile_welcome() to service_role;
