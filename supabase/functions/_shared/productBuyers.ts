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

type SeatProduct = { id: string; max_buyers?: number | null; sales_closed?: boolean | null }

/** True when the limit of paid buyers is reached; trial users take no seat. */
export async function seatsFull(supabase: SupabaseClient, product: SeatProduct): Promise<boolean> {
  if (product.max_buyers == null) return false
  const paid = await activeBuyerIds(supabase, product.id, { includeTrials: false })
  return paid.length >= product.max_buyers
}

/**
 * Whether this buyer may pay for the product now. With every seat taken, a buyer still may
 * when they already hold one (paying the next period) or when their earlier paid access ran
 * out by itself; a buyer whose access the seller closed may not.
 */
export async function buyerCanTakeSeat(
  supabase: SupabaseClient,
  product: SeatProduct,
  buyerId: string,
): Promise<{ ok: true } | { ok: false; code: 'sales_closed' | 'no_seats' }> {
  if (product.sales_closed) return { ok: false, code: 'sales_closed' }
  if (product.max_buyers == null) return { ok: true }
  const paid = await activeBuyerIds(supabase, product.id, { includeTrials: false })
  if (paid.includes(buyerId)) return { ok: true }
  if (paid.length < product.max_buyers) return { ok: true }

  const { data: earlier } = await supabase
    .from('simple_purchases')
    .select('status, is_trial')
    .eq('product_id', product.id)
    .eq('buyer_profile_id', buyerId)
  const rows = (earlier ?? []) as { status: string; is_trial: boolean | null }[]
  if (rows.some((r) => r.status === 'revoked')) return { ok: false, code: 'no_seats' }
  if (rows.some((r) => r.status === 'completed' && !r.is_trial)) return { ok: true }
  return { ok: false, code: 'no_seats' }
}
