import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isSubscriptionProduct } from './subscription.ts'

/**
 * A product sold with a payment period ("Период оплаты": 7 / 14 days, a month, 3 months,
 * a year or a custom number of days) outside the «Подписки» category. Every paid period
 * gives access for that many days and can be paid again; «Подписки» keep using the
 * subscriptions table instead.
 */

const INTERVAL_DAYS: Record<string, number> = { '7d': 7, '14d': 14, '1m': 30, '3m': 90, '1y': 365 }

export type AccessPeriod = { days: number; interval: string }

type PeriodSource = {
  payment_type?: string | null
  recurring_interval?: string | null
  access_duration_days?: number | null
  price?: number | string | null
}

export type PeriodProduct = PeriodSource & { pricing_options?: unknown }

function periodOf(src: PeriodSource): AccessPeriod | null {
  if (src.payment_type !== 'recurring') return null
  const interval = String(src.recurring_interval || '')
  const days = Number(src.access_duration_days) || INTERVAL_DAYS[interval] || 0
  return days > 0 ? { days, interval: interval || 'custom' } : null
}

/** The period that was bought: the pricing option with the paid amount, else the product's own. */
export function accessPeriodFor(product: PeriodProduct, amount: number | string | null | undefined): AccessPeriod | null {
  const options = Array.isArray(product.pricing_options) ? (product.pricing_options as PeriodSource[]) : []
  const paid = Number(amount)
  const option = options.find((o) => o?.payment_type === 'recurring' && Number(o?.price) === paid)
  return (option && periodOf(option)) || periodOf(product)
}

export const PERIOD_PRODUCT_COLUMNS = 'payment_type, recurring_interval, access_duration_days, pricing_options'

/** Sets the end of access on a freshly paid purchase of a period product. */
export async function applyAccessPeriod(supabase: SupabaseClient, purchaseId: string): Promise<void> {
  const { data: purchase } = await supabase
    .from('simple_purchases')
    .select('id, product_id, buyer_profile_id, simple_user_id, amount, is_trial')
    .eq('id', purchaseId)
    .maybeSingle()
  if (!purchase || purchase.is_trial) return
  if (await isSubscriptionProduct(supabase, purchase.product_id)) return

  const { data: product } = await supabase
    .from('products')
    .select(PERIOD_PRODUCT_COLUMNS)
    .eq('id', purchase.product_id)
    .maybeSingle()
  const period = product ? accessPeriodFor(product as PeriodProduct, purchase.amount) : null
  if (!period) return

  // Paying ahead adds the period to the end of the access already paid for.
  const owner = purchase.buyer_profile_id
    ? { column: 'buyer_profile_id', value: purchase.buyer_profile_id }
    : { column: 'simple_user_id', value: purchase.simple_user_id }
  const { data: earlier } = await supabase
    .from('simple_purchases')
    .select('access_expires_at')
    .eq(owner.column, owner.value)
    .eq('product_id', purchase.product_id)
    .eq('status', 'completed')
    .neq('id', purchase.id)
    .not('access_expires_at', 'is', null)
    .order('access_expires_at', { ascending: false })
    .limit(1)
  const now = new Date()
  const previousEnd = earlier?.[0]?.access_expires_at ? new Date(earlier[0].access_expires_at) : null
  const start = previousEnd && previousEnd > now ? previousEnd : now
  const end = new Date(start.getTime() + period.days * 86_400_000)

  const { error } = await supabase
    .from('simple_purchases')
    .update({ access_expires_at: end.toISOString() })
    .eq('id', purchase.id)
  if (error) console.error('access period update failed', error)
}
