/** Dry-run by default. Run only after review; never add this to a migration/deploy hook. */
import { createClient } from '@supabase/supabase-js';

const send = process.argv.includes('--send');
const activate = process.argv.includes('--activate');
const db = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { persistSession: false } });
let sent = 0, skipped = 0, errors = 0, offset = 0;
if (activate && !send) throw new Error('--activate requires --send');
if (activate) {
  const { error } = await db.from('support_campaigns').update({ enabled: true }).eq('key', 'support_welcome_v1');
  if (error) throw error;
}
if (send) {
  const { data, error } = await db.from('support_campaigns').select('enabled').eq('key','support_welcome_v1').single();
  if (error || !data?.enabled) throw error || new Error('Campaign disabled. Review first, then use --send --activate.');
}
while (true) {
  const { data: profiles, error } = await db.from('profiles').select('id').in('type',['buyer','creator','school']).not('auth_user_id','is',null).eq('is_demo',false).order('id').range(offset,offset+199);
  if (error) throw error;
  if (!profiles?.length) break;
  const { data: delivered, error: readError } = await db.from('support_campaign_deliveries').select('profile_id').eq('campaign_key','support_welcome_v1').in('profile_id',profiles.map((p)=>p.id));
  if (readError) throw readError;
  const done = new Set(delivered?.map((p)=>p.profile_id));
  for (const p of profiles) {
    if (done.has(p.id)) { skipped++; continue; }
    if (!send) { sent++; continue; }
    const { data, error: deliveryError } = await db.rpc('deliver_support_welcome',{p_profile:p.id});
    if (deliveryError) { errors++; console.error('Delivery failed for profile',p.id,deliveryError.code); }
    else if (data) sent++; else skipped++;
  }
  offset += profiles.length;
  console.log({ mode: send ? 'send' : 'dry-run', processed: offset, [send ? 'sent' : 'pending']: sent, skipped, errors });
}
console.log({ mode: send ? 'send' : 'dry-run', [send ? 'sent' : 'pending']: sent, skipped, errors });
if (errors) process.exitCode = 1;
