import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { onPurchaseCompleted } from './subscription.ts'

export type CompletePurchaseResult =
  | { ok: true; already: boolean; purchase: any }
  | { ok: false; error: string }

export async function completePurchase(
  supabase: SupabaseClient,
  purchaseId: string,
): Promise<CompletePurchaseResult> {
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: purchaseRow } = await supabase
    .from('simple_purchases')
    .select('id, product_id, status, buyer_profile_id, simple_user_id, amount')
    .eq('id', purchaseId)
    .maybeSingle()

  if (!purchaseRow) return { ok: false, error: 'Purchase not found' }
  if (purchaseRow.status === 'completed') {
    await onPurchaseCompleted(supabase, purchaseRow)
    return { ok: true, already: true, purchase: purchaseRow }
  }
  if (purchaseRow.status !== 'pending') {
    return { ok: false, error: 'Purchase is not pending' }
  }

  // Time-limited access counts from confirmation, not from payment
  let accessEndsAt: string | null = null
  if (purchaseRow.product_id) {
    const { data: prod } = await supabase
      .from('products')
      .select('access_duration_days')
      .eq('id', purchaseRow.product_id)
      .maybeSingle()
    if (prod?.access_duration_days && prod.access_duration_days > 0) {
      const end = new Date(now.getTime() + prod.access_duration_days * 24 * 60 * 60 * 1000)
      accessEndsAt = end.toISOString()
    }
  }

  const updatePayload: Record<string, any> = {
    status: 'completed',
    confirmed_at: nowIso,
  }
  if (accessEndsAt) {
    updatePayload.access_ends_at = accessEndsAt
  }

  const { data, error } = await supabase
    .from('simple_purchases')
    .update(updatePayload)
    .eq('id', purchaseId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (data) {
    await onPurchaseCompleted(supabase, data)
    return { ok: true, already: false, purchase: data }
  }

  return { ok: false, error: 'Purchase update failed' }
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
