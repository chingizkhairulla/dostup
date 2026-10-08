import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function scalar(sql: string) { return (await db.query<Record<string, unknown>>(sql)).rows[0]?.value; }

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table profiles(id uuid primary key, type text, auth_user_id uuid, display_name text, is_demo boolean not null default false);
    create table creator_accounts(id uuid primary key, profile_id uuid references profiles, login text);
    create table categories(id uuid primary key, slug text);
    create table products(id uuid primary key, creator_account_id uuid references creator_accounts, category_id uuid references categories);
    create table simple_purchases(id uuid primary key, product_id uuid references products on delete cascade, buyer_profile_id uuid references profiles, status text, is_trial boolean default false, trial_ends_at timestamptz, access_expires_at timestamptz, confirmed_at timestamptz);
    create table subscriptions(id uuid primary key, product_id uuid references products, buyer_profile_id uuid references profiles, status text, current_period_end timestamptz);
    create table direct_threads(id uuid primary key default gen_random_uuid(), creator_account_id uuid references creator_accounts, buyer_profile_id uuid references profiles, last_message_at timestamptz, last_message_preview text, unread_for_creator int default 0, unread_for_buyer int default 0, unique(creator_account_id,buyer_profile_id));
    create table direct_messages(id uuid primary key default gen_random_uuid(), thread_id uuid references direct_threads, sender text, text text default '', attachments jsonb default '[]', created_at timestamptz default now());
    create table support_threads(id uuid primary key default gen_random_uuid(), user_type text, user_ref text, display_name text, last_message_at timestamptz default now(), last_message_preview text, unread_for_moderator int default 0, unread_for_user int default 0, unique(user_type,user_ref));
    create table support_messages(id uuid primary key default gen_random_uuid(), thread_id uuid references support_threads, sender text, text text, created_at timestamptz default now());
    create table product_teachers(teacher_name text);
    insert into profiles(id,type,auth_user_id,display_name) values('${id(1)}','creator','${id(101)}','Автор'),('${id(2)}','buyer','${id(102)}','Покупатель'),('${id(3)}','buyer','${id(103)}','Новый покупатель');
    insert into creator_accounts values('${id(10)}','${id(1)}','seller');
    insert into categories values('${id(20)}','courses'),('${id(21)}','subscriptions');
    insert into products values('${id(30)}','${id(10)}','${id(20)}'),('${id(31)}','${id(10)}','${id(21)}');
    insert into simple_purchases(id,product_id,buyer_profile_id,status) values('${id(40)}','${id(30)}','${id(2)}','completed');
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261008154130_messages_access_and_onboarding.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

test('migration preserves historical pair without sending an invitation or welcome', async () => {
  assert.equal(await scalar('select count(*)::int value from direct_threads'), 1);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 0);
  assert.equal(await scalar('select count(*)::int value from support_messages'), 0);
});
test('group URL is required and unsafe URLs fail at database boundary', async () => {
  for (const url of [null, '', 'http://example.com', 'https://user:pass@example.com', 'javascript:alert(1)']) {
    await assert.rejects(db.query('update products set after_access_enabled=true,after_access_url=$1 where id=$2', [url,id(30)]));
  }
  await db.query('update products set after_access_enabled=true,after_access_url=$1 where id=$2', ['https://t.me/test_group',id(30)]);
});
test('pending does not create chat; grant creates one pair and one invitation, retry is harmless', async () => {
  await db.exec(`insert into simple_purchases(id,product_id,buyer_profile_id,status) values('${id(41)}','${id(30)}','${id(3)}','pending')`);
  assert.equal(await scalar('select count(*)::int value from direct_threads'), 1);
  await db.exec(`update simple_purchases set status='completed' where id='${id(41)}'`);
  assert.equal(await scalar('select count(*)::int value from direct_threads'), 2);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 1);
  assert.equal(await scalar(`select unread_for_buyer value from direct_threads where buyer_profile_id='${id(3)}'`), 1);
  await db.exec(`update simple_purchases set status='completed',confirmed_at=now() where id='${id(41)}'`);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 1);
});
test('read acknowledgement keeps a message that arrived after the fetch unread', async () => {
  const { rows } = await db.query<{id:string;thread_id:string}>('select id,thread_id from direct_messages');
  await db.query("insert into direct_messages(thread_id,sender,text) values($1,'creator','Следующее')", [rows[0].thread_id]);
  await db.query("select mark_direct_messages_read($1,'buyer',$2::uuid[])", [rows[0].thread_id,[rows[0].id]]);
  assert.equal(await scalar(`select unread_for_buyer value from direct_threads where buyer_profile_id='${id(3)}'`), 1);
});
test('subscription waits for active period; retries and product edits do not resend', async () => {
  await db.exec(`update products set after_access_enabled=true,after_access_url='https://t.me/subscribers' where id='${id(31)}';
    insert into simple_purchases(id,product_id,buyer_profile_id,status) values('${id(42)}','${id(31)}','${id(3)}','completed')`);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 2);
  await db.exec(`insert into subscriptions values('${id(50)}','${id(31)}','${id(3)}','active',now()+interval '30 days')`);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 3);
  await db.exec(`update subscriptions set current_period_end=now()+interval '40 days'; update products set after_access_url='https://t.me/new' where id='${id(31)}'`);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 3);
});
test('revocation retains history; reopening reuses pair and delivers once', async () => {
  await db.exec(`update simple_purchases set status='revoked' where id='${id(41)}'; update simple_purchases set status='completed' where id='${id(41)}'`);
  assert.equal(await scalar('select count(*)::int value from direct_threads'), 2);
  assert.equal(await scalar('select count(*)::int value from direct_messages'), 4);
});
test('install hint is claimed once per profile', async () => {
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(3)}') value`), true);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(3)}') value`), false);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(2)}') value`), true);
});
test('welcome is disabled until explicit activation; activation and retries are idempotent', async () => {
  assert.equal(await scalar(`select deliver_support_welcome('${id(3)}') value`), false);
  await db.exec("update support_campaigns set enabled=true where key='support_welcome_v1'");
  assert.equal(await scalar(`select deliver_support_welcome('${id(3)}') value`), true);
  assert.equal(await scalar(`select deliver_support_welcome('${id(3)}') value`), false);
  assert.equal(await scalar(`select deliver_support_welcome('${id(1)}') value`), true);
  await db.exec(`insert into profiles(id,type,auth_user_id,display_name) values('${id(4)}','buyer','${id(104)}','Ещё один'); insert into profiles(id,type,auth_user_id,display_name) values('${id(5)}','creator','${id(105)}','Новый автор'); insert into creator_accounts values('${id(11)}','${id(5)}','seller2')`);
  assert.equal(await scalar('select count(*)::int value from support_messages'), 4);
  assert.equal(await scalar("select text value from support_messages limit 1"), 'Здравствуйте, рады вас видеть!\n\nПишите что можно улучшить или добавить.\n\nМы с радостью исправим это!');
});
test('anonymous roles cannot call RPCs or inspect private state', async () => {
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query(`select claim_messenger_install_hint('${id(3)}')`));
    await assert.rejects(db.query(`select deliver_support_welcome('${id(3)}')`));
    await assert.rejects(db.query('select * from direct_access_events'));
    await assert.rejects(db.query('select * from support_campaign_deliveries'));
  } finally { await db.exec('reset role'); }
});

test('service role can call RPCs and triggers without public execution privileges', async () => {
  await db.exec('set role service_role');
  try {
    assert.equal(await scalar(`select claim_messenger_install_hint('${id(1)}') value`),true);
    await db.exec(`insert into simple_purchases(id,product_id,buyer_profile_id,status) values('${id(43)}','${id(30)}','${id(4)}','completed')`);
    assert.equal(await scalar(`select count(*)::int value from direct_threads where buyer_profile_id='${id(4)}'`),1);
  } finally { await db.exec('reset role'); }
});
