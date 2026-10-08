import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGroupLink } from '../src/lib/groupLink';
import { chatFileError } from '../src/lib/chatFiles';
import { directPurchaseActive } from '../supabase/functions/_shared/directAccess';
const now = new Date('2026-10-08T12:00:00Z');
test('group link rejects blank, relative, unsafe and credential-bearing URLs', () => {
  for (const input of ['', ' ', '/group','http://t.me/a','javascript:alert(1)','https://user:pass@t.me/a','https://localhost/a']) assert.equal(normalizeGroupLink(input),null);
  assert.equal(normalizeGroupLink('  https://t.me/course  '),'https://t.me/course');
});
test('chat file limits cover drag-and-drop documents, media and invalid files', () => {
  assert.equal(chatFileError({type:'application/pdf',size:1}),null);
  assert.equal(chatFileError({type:'video/mp4',size:500*1024*1024}),null);
  assert.ok(chatFileError({type:'video/mp4',size:500*1024*1024+1}));
  assert.ok(chatFileError({type:'application/pdf',size:50*1024*1024+1}));
  assert.ok(chatFileError({type:'application/pdf',size:0}));
  assert.ok(chatFileError({type:'text/html',size:1}));
});
test('chat stays active while any seller product is accessible', () => {
  const products = [{status:'completed',access_expires_at:'2026-10-01'}, {status:'completed',access_expires_at:null}];
  assert.ok(products.some((p)=>directPurchaseActive(p,undefined,false,now)));
  products[1].access_expires_at='2026-10-02';
  assert.equal(products.some((p)=>directPurchaseActive(p,undefined,false,now)),false);
  assert.ok(directPurchaseActive({status:'completed'},undefined,false,now));
  assert.equal(directPurchaseActive({status:'revoked'},undefined,false,now),false);
});
test('subscription and trial expiration use actual access rules', () => {
  assert.equal(directPurchaseActive({status:'completed'},undefined,true,now),false);
  assert.ok(directPurchaseActive({status:'completed'},{status:'cancelled',current_period_end:'2026-10-09'},true,now));
  assert.equal(directPurchaseActive({status:'completed'},{status:'past_due',current_period_end:'2026-10-09'},true,now),false);
  assert.equal(directPurchaseActive({status:'completed',is_trial:true,trial_ends_at:'2026-10-07'},undefined,false,now),false);
});
