import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { onPurchaseCompleted } from './subscription.ts'
import { applyAccessPeriod } from './accessPeriod.ts'

export type CompletePurchaseResult =
  | { ok: true; already: boolean }
  | { ok: false; error: string }

export async function completePurchase(
  supabase: SupabaseClient,
  purchaseId: string,
): Promise<CompletePurchaseResult> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('simple_purchases')
    .update({ status: 'completed', confirmed_at: now })
    .eq('id', purchaseId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (data) {
    const { data: purchase } = await supabase
      .from('simple_purchases')
      .select('product_id, buyer_profile_id, simple_user_id, amount')
      .eq('id', purchaseId)
      .maybeSingle()
    if (purchase) await onPurchaseCompleted(supabase, purchase)
    await applyAccessPeriod(supabase, purchaseId)
    return { ok: true, already: false }
  }

  const { data: existing } = await supabase
    .from('simple_purchases')
    .select('status, product_id, buyer_profile_id, simple_user_id, amount')
    .eq('id', purchaseId)
    .maybeSingle()

  if (existing?.status === 'completed') {
    await onPurchaseCompleted(supabase, existing)
    return { ok: true, already: true }
  }
  return { ok: false, error: 'Purchase is not pending' }
}

export async function recordVerificationEvent(
  supabase: SupabaseClient,
  input: {
    submissionId: string
    purchaseId: string
    actor: string
    decision: string
    checks: Record<string, unknown>
    notes?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('payment_verification_events').insert({
    submission_id: input.submissionId,
    purchase_id: input.purchaseId,
    actor: input.actor,
    decision: input.decision,
    checks: input.checks,
    notes: input.notes ?? null,
  })
  if (error) console.error('audit insert failed', error)
}

export const SUBMISSION_PUBLIC_COLUMNS =
  'id, purchase_id, verification_status, rejection_reason, detected_amount, detected_currency, transaction_id, receipt_type, decided_at, created_at'

export type LatestSubmission = {
  id: string
  purchase_id: string
  verification_status: string
  rejection_reason: string | null
  detected_amount: number | null
  detected_currency: string | null
  transaction_id: string | null
  receipt_type: string
  decided_at: string | null
  created_at: string
}

export async function latestSubmissionForPurchase(
  supabase: SupabaseClient,
  purchaseId: string,
): Promise<LatestSubmission | null> {
  const { data } = await supabase
    .from('payment_submissions')
    .select(SUBMISSION_PUBLIC_COLUMNS)
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as LatestSubmission | null) ?? null
}

export async function latestSubmissionsForPurchases(
  supabase: SupabaseClient,
  purchaseIds: string[],
): Promise<Map<string, LatestSubmission>> {
  const map = new Map<string, LatestSubmission>()
  if (!purchaseIds.length) return map
  const { data } = await supabase
    .from('payment_submissions')
    .select(SUBMISSION_PUBLIC_COLUMNS)
    .in('purchase_id', purchaseIds)
    .order('created_at', { ascending: false })
  for (const row of (data ?? []) as LatestSubmission[]) {
    if (!map.has(row.purchase_id)) map.set(row.purchase_id, row)
  }
  return map
}
