import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const welcome = 'Здравствуйте, рады вас видеть!\n\nПишите что можно улучшить или добавить.\n\nМы с радостью возьмемся за это!';
async function scalar(sql: string) { return (await db.query<Record<string, unknown>>(sql)).rows[0]?.value; }
async function createProfile(n: number, identity: number, type = 'buyer', demo = false) {
  await db.query('insert into auth.users(id) values($1) on conflict do nothing', [id(identity)]);
  await db.query('insert into profiles(id,auth_user_id,type,display_name,is_demo) values($1,$2,$3,$4,$5)', [id(n),id(identity),type,`Профиль ${n}`,demo]);
}
async function threadMessage(profile: number, type = 'student', ref = id(profile)) {
  return scalar(`select m.text value from support_messages m join support_threads t on t.id=m.thread_id where t.user_type='${type}' and t.user_ref='${ref}'`);
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table profiles(id uuid primary key, type text, auth_user_id uuid references auth.users on delete cascade, display_name text, is_demo boolean not null default false, created_at timestamptz not null default now());
    create table creator_accounts(id uuid primary key, profile_id uuid references profiles on delete cascade, login text);
    create table categories(id uuid primary key, slug text);
    create table products(id uuid primary key, creator_account_id uuid references creator_accounts, category_id uuid references categories);
    create table simple_purchases(id uuid primary key, product_id uuid references products, buyer_profile_id uuid references profiles, status text, is_trial boolean default false, trial_ends_at timestamptz, access_expires_at timestamptz, confirmed_at timestamptz);
    create table subscriptions(id uuid primary key, product_id uuid references products, buyer_profile_id uuid references profiles, status text, current_period_end timestamptz);
    create table direct_threads(id uuid primary key default gen_random_uuid(), creator_account_id uuid references creator_accounts, buyer_profile_id uuid references profiles, last_message_at timestamptz, last_message_preview text, unread_for_creator int default 0, unread_for_buyer int default 0, unique(creator_account_id,buyer_profile_id));
    create table direct_messages(id uuid primary key default gen_random_uuid(), thread_id uuid references direct_threads, sender text, text text default '', attachments jsonb default '[]', created_at timestamptz default now());
    create table support_threads(id uuid primary key default gen_random_uuid(), user_type text, user_ref text, display_name text, last_message_at timestamptz default now(), last_message_preview text, unread_for_moderator int default 0, unread_for_user int default 0, unique(user_type,user_ref));
    create table support_messages(id uuid primary key default gen_random_uuid(), thread_id uuid references support_threads, sender text, text text, created_at timestamptz default now());
    create table product_teachers(teacher_name text);
    insert into auth.users values('${id(100)}'),('${id(200)}');
    insert into profiles(id,type,auth_user_id,display_name,created_at) values
      ('${id(1)}','buyer','${id(100)}','Первый','2000-01-01'),
      ('${id(2)}','creator','${id(100)}','Второй','2001-01-01'),
      ('${id(3)}','buyer','${id(200)}','Существующий','2000-01-01');
    insert into creator_accounts values('${id(10)}','${id(2)}','old_seller');
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261008154130_messages_access_and_onboarding.sql', import.meta.url), 'utf8'));
  await db.exec(`select claim_messenger_install_hint('${id(2)}'); update support_campaigns set enabled=true; select deliver_support_welcome('${id(2)}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028111154_account_first_profile_messenger_onboarding.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

test('upgrade preserves old deliveries and seen hints across sibling profiles without sending a historical campaign', async () => {
  assert.equal(await scalar('select count(*)::int value from support_messages'), 1);
  assert.equal(await scalar(`select first_profile_id value from messenger_account_state where auth_user_id='${id(100)}'`), id(1));
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(1)}') value`), false);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(2)}') value`), false);
  assert.equal(await scalar(`select deliver_support_welcome('${id(3)}') value`), false);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(3)}') value`), true);
});

test('new first buyer gets the exact welcome, unread badge and one install hint automatically', async () => {
  await createProfile(101,1001);
  assert.equal(await threadMessage(101),welcome);
  assert.equal(await scalar(`select unread_for_user value from support_threads where user_ref='${id(101)}'`),1);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(101)}') value`),true);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(101)}') value`),false);
});

test('second profile never gets a welcome or hint, even when visited before the first', async () => {
  await createProfile(102,1002,'creator');
  await createProfile(103,1002,'buyer');
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(103)}') value`),false);
  assert.equal(await threadMessage(103),undefined);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(102)}') value`),true);
  await db.exec(`insert into creator_accounts values('${id(110)}','${id(102)}','first_seller')`);
  assert.equal(await threadMessage(102,'creator','first_seller'),welcome);
  assert.equal(await scalar(`select deliver_support_welcome('${id(103)}') value`),false);
});

test('seller welcome waits for its account and retries do not duplicate message or badge', async () => {
  await createProfile(104,1004,'school');
  assert.equal(await scalar(`select deliver_support_welcome('${id(104)}') value`),false);
  await db.exec(`insert into creator_accounts values('${id(111)}','${id(104)}','first_school')`);
  const replies = await Promise.all(Array.from({length:8}, () => db.query(`select deliver_support_welcome('${id(104)}') value`)));
  assert.ok(replies.every(result => result.rows[0].value === false));
  assert.equal(await threadMessage(104,'creator','first_school'),welcome);
  assert.equal(await scalar("select unread_for_user value from support_threads where user_ref='first_school'"),1);
});

test('concurrent first-profile creation chooses one identity owner and only one welcome', async () => {
  await db.exec(`insert into auth.users values('${id(1005)}')`);
  await Promise.all([
    db.exec(`insert into profiles(id,auth_user_id,type,display_name) values('${id(105)}','${id(1005)}','creator','Автор')`),
    db.exec(`insert into profiles(id,auth_user_id,type,display_name) values('${id(106)}','${id(1005)}','school','Школа')`),
  ]);
  await db.exec(`insert into creator_accounts values('${id(112)}','${id(105)}','parallel_author'),('${id(113)}','${id(106)}','parallel_school')`);
  assert.equal(await scalar("select count(*)::int value from support_messages m join support_threads t on t.id=m.thread_id where t.user_ref in ('parallel_author','parallel_school')"),1);
  const hints = await Promise.all([105,106].map(n => scalar(`select claim_messenger_install_hint('${id(n)}') value`)));
  assert.equal(hints.filter(Boolean).length,1);
});

test('deleting the first profile does not make a later profile a new first profile', async () => {
  await createProfile(107,1007);
  await db.exec(`delete from profiles where id='${id(107)}'`);
  await createProfile(108,1007,'creator');
  await db.exec(`insert into creator_accounts values('${id(114)}','${id(108)}','replacement_seller')`);
  assert.equal(await scalar(`select claim_messenger_install_hint('${id(108)}') value`),false);
  assert.equal(await threadMessage(108,'creator','replacement_seller'),undefined);
  assert.equal(await scalar(`select count(*)::int value from messenger_account_state where auth_user_id='${id(1007)}'`),1);
});

test('demo, moderator and unknown profiles receive neither welcome nor install hint', async () => {
  await createProfile(109,1009,'buyer',true);
  await createProfile(110,1010,'moderator');
  for (const profile of [109,110,999]) {
    assert.equal(await scalar(`select claim_messenger_install_hint('${id(profile)}') value`),false);
    assert.equal(await scalar(`select deliver_support_welcome('${id(profile)}') value`),false);
    assert.equal(await threadMessage(profile),undefined);
  }
});

test('anonymous and authenticated roles cannot inspect identity state or execute onboarding RPCs', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from messenger_account_state'));
      await assert.rejects(db.query(`select claim_messenger_install_hint('${id(101)}')`));
      await assert.rejects(db.query(`select deliver_support_welcome('${id(101)}')`));
    } finally { await db.exec('reset role'); }
  }
});

test('service role can create the first profile and deliver its welcome without public execute grants', async () => {
  await db.exec(`insert into auth.users values('${id(1011)}'); set role service_role`);
  try {
    await db.exec(`insert into profiles(id,auth_user_id,type,display_name) values('${id(111)}','${id(1011)}','buyer','Сервис')`);
    assert.equal(await scalar(`select claim_messenger_install_hint('${id(111)}') value`),true);
  } finally { await db.exec('reset role'); }
  assert.equal(await threadMessage(111),welcome);
});

test('failed welcome rolls back its claim so retrying profile creation delivers once', async () => {
  await db.exec(`
    create function messenger_private.reject_test_welcome() returns trigger language plpgsql as $$
    begin raise exception 'Simulated delivery failure'; end;
    $$;
    create trigger reject_test_welcome before insert on support_messages
      for each row execute function messenger_private.reject_test_welcome();
  `);
  try {
    await assert.rejects(createProfile(112,1012), /Simulated delivery failure/);
    assert.equal(await scalar(`select count(*)::int value from profiles where id='${id(112)}'`),0);
    assert.equal(await scalar(`select count(*)::int value from messenger_account_state where auth_user_id='${id(1012)}'`),0);
  } finally {
    await db.exec('drop trigger reject_test_welcome on support_messages; drop function messenger_private.reject_test_welcome()');
  }
  await createProfile(112,1012);
  assert.equal(await threadMessage(112),welcome);
  assert.equal(await scalar(`select unread_for_user value from support_threads where user_ref='${id(112)}'`),1);
});
