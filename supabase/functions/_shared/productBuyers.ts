import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { subscriptionGrantsAccess } from './subscription.ts'

type PurchaseRow = {
  buyer_profile_id: string | null
  simple_user_id: string | null
  is_trial: boolean | null
  trial_ends_at: string | null
  access_expires_at: string | null
}

/**
 * Buyers who can use the product right now: a paid purchase that the seller has not closed,
 * whose subscription period, trial or seller-set end date has not passed. Trial users count
 * only when `includeTrials` is set.
 */
export async function activeBuyerIds(
  supabase: SupabaseClient,
  productId: string,
  { includeTrials = true }: { includeTrials?: boolean } = {},
): Promise<string[]> {
  const { data: purchases } = await supabase
    .from('simple_purchases')
    .select('buyer_profile_id, simple_user_id, is_trial, trial_ends_at, access_expires_at')
    .eq('product_id', productId)
    .eq('status', 'completed')
  const rows = (purchases ?? []) as PurchaseRow[]
  if (!rows.length) return []

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('buyer_profile_id, status, current_period_end')
    .eq('product_id', productId)
  const subByBuyer = new Map(
    (subs ?? []).map((s: { buyer_profile_id: string; status: 'active' | 'past_due' | 'cancelled'; current_period_end: string }) => [s.buyer_profile_id, s]),
  )

  const now = Date.now()
  const active = new Set<string>()
  for (const p of rows) {
    const buyer = p.buyer_profile_id || p.simple_user_id
    if (!buyer) continue
    if (p.is_trial) {
      if (includeTrials && p.trial_ends_at && new Date(p.trial_ends_at).getTime() > now) active.add(buyer)
      continue
    }
    const sub = p.buyer_profile_id ? subByBuyer.get(p.buyer_profile_id) : undefined
    if (sub) {
      if (subscriptionGrantsAccess(sub)) active.add(buyer)
      continue
    }
    if (!p.access_expires_at || new Date(p.access_expires_at).getTime() > now) active.add(buyer)
  }
  return [...active]
}
