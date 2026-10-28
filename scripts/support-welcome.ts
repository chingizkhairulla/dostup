/** Automatic welcome runs on first-profile creation; this is a dry-run/retry tool only. */
import { createClient } from '@supabase/supabase-js';

const send = process.argv.includes('--send');
if (process.argv.includes('--activate')) {
  throw new Error('--activate is no longer supported. First-profile welcomes are automatic; --send only retries pending deliveries.');
}
const db = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { persistSession: false } });
let sent = 0, skipped = 0, errors = 0, processed = 0;
let cursor: string | null = null;
while (true) {
  let query = db.from('messenger_account_state').select('auth_user_id,first_profile_id')
    .eq('welcome_pending',true).is('welcome_delivered_at',null).not('first_profile_id','is',null)
    .order('auth_user_id').limit(200);
  if (cursor) query = query.gt('auth_user_id',cursor);
  const { data: accounts, error } = await query;
  if (error) throw error;
  if (!accounts?.length) break;
  for (const account of accounts) {
    if (!send) { sent++; continue; }
    const { data, error: deliveryError } = await db.rpc('deliver_support_welcome',{p_profile:account.first_profile_id});
    if (deliveryError) { errors++; console.error('Delivery failed for profile',account.first_profile_id,deliveryError.code); }
    else if (data) sent++; else skipped++;
  }
  processed += accounts.length;
  cursor = accounts[accounts.length-1].auth_user_id;
  console.log({ mode: send ? 'send' : 'dry-run', processed, [send ? 'sent' : 'pending']: sent, skipped, errors });
}
console.log({ mode: send ? 'send' : 'dry-run', [send ? 'sent' : 'pending']: sent, skipped, errors });
if (errors) process.exitCode = 1;
