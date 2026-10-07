import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled'
export type BillingPeriod = 'month' | 'quarter' | 'year'

export type SubscriptionRow = {
  id: string
  product_id: string
  buyer_profile_id: string
  billing_period: BillingPeriod
  price: number
  current_period_start: string
  current_period_end: string
  status: SubscriptionStatus
  auto_renew: boolean
  payment_token_id: string | null
  renewal_reminder_sent_at: string | null
  created_at: string
}

export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from)
  if (period === 'month') {
    d.setMonth(d.getMonth() + 1)
    return d
  }
  if (period === 'quarter') {
    d.setMonth(d.getMonth() + 3)
    return d
  }
  d.setFullYear(d.getFullYear() + 1)
  return d
}

export function subscriptionGrantsAccess(sub: Pick<SubscriptionRow, 'status' | 'current_period_end'>): boolean {
  const end = new Date(sub.current_period_end)
  if (end <= new Date()) return false
  if (sub.status === 'past_due') return false
  return sub.status === 'active' || sub.status === 'cancelled'
}

export async function productCategorySlug(
  supabase: SupabaseClient,
  productId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('products')
    .select('category_id, categories!inner(slug)')
    .eq('id', productId)
    .maybeSingle()
  const categories = data?.categories as { slug: string } | { slug: string }[] | null
  if (!categories) return null
  if (Array.isArray(categories)) return categories[0]?.slug ?? null
  return categories.slug ?? null
}

export async function isSubscriptionProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<boolean> {
  const slug = await productCategorySlug(supabase, productId)
  return slug === 'subscriptions'
}

export async function getSubscription(
  supabase: SupabaseClient,
  buyerProfileId: string,
  productId: string,
): Promise<SubscriptionRow | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('buyer_profile_id', buyerProfileId)
    .eq('product_id', productId)
    .maybeSingle()
  return (data as SubscriptionRow | null) ?? null
}

export async function buyerHasActiveSubscription(
  supabase: SupabaseClient,
  buyerProfileId: string,
  productId: string,
): Promise<boolean> {
  const sub = await getSubscription(supabase, buyerProfileId, productId)
  if (!sub) return false
  return subscriptionGrantsAccess(sub)
}

export async function buyerHasProductAccess(
  supabase: SupabaseClient,
  buyerProfileId: string,
  productId: string,
): Promise<boolean> {
  if (await isSubscriptionProduct(supabase, productId)) {
    return buyerHasActiveSubscription(supabase, buyerProfileId, productId)
  }

  const { data } = await supabase
    .from('simple_purchases')
    .select('id, is_trial, trial_ends_at, access_expires_at')
    .eq('buyer_profile_id', buyerProfileId)
    .eq('product_id', productId)
    .eq('status', 'completed')
    .maybeSingle()

  if (!data) return false
  if (data.is_trial) {
    return !!(data.trial_ends_at && new Date(data.trial_ends_at) > new Date())
  }
  return purchaseAccessOpen(data)
}

/** A seller-set end date closes a one-time purchase; NULL keeps it open for good. */
export function purchaseAccessOpen(row: { access_expires_at?: string | null }, now = new Date()): boolean {
  return !row.access_expires_at || new Date(row.access_expires_at) > now
}

export async function buyerAccessibleProductIds(
  supabase: SupabaseClient,
  buyerProfileId: string,
): Promise<string[]> {
  const ids = new Set<string>()
  const now = new Date()

  const { data: purchases } = await supabase
    .from('simple_purchases')
    .select('product_id, is_trial, trial_ends_at, access_expires_at')
    .eq('buyer_profile_id', buyerProfileId)
    .eq('status', 'completed')

  for (const row of purchases ?? []) {
    const productId = row.product_id as string
    if (row.is_trial) {
      if (row.trial_ends_at && new Date(row.trial_ends_at) > now) {
        ids.add(productId)
      }
      continue
    }
    if (!purchaseAccessOpen(row, now)) continue
    if (!(await isSubscriptionProduct(supabase, productId))) {
      ids.add(productId)
    }
  }

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('product_id, status, current_period_end')
    .eq('buyer_profile_id', buyerProfileId)

  for (const sub of (subs ?? []) as Pick<SubscriptionRow, 'product_id' | 'status' | 'current_period_end'>[]) {
    if (subscriptionGrantsAccess(sub)) ids.add(sub.product_id)
  }

  return [...ids]
}

export async function activateOrExtendSubscription(
  supabase: SupabaseClient,
  input: {
    productId: string
    buyerProfileId: string
    price: number
  },
): Promise<{ ok: true; subscription: SubscriptionRow } | { ok: false; error: string }> {
  const { data: product } = await supabase
    .from('products')
    .select('id, price, billing_period')
    .eq('id', input.productId)
    .maybeSingle()

  if (!product?.billing_period) {
    return { ok: false, error: 'Product billing_period missing' }
  }

  const period = product.billing_period as BillingPeriod
  const price = Number(input.price) || Number(product.price) || 0
  const now = new Date()
  const existing = await getSubscription(supabase, input.buyerProfileId, input.productId)

  if (!existing) {
    const periodEnd = addBillingPeriod(now, period)
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        product_id: input.productId,
        buyer_profile_id: input.buyerProfileId,
        billing_period: period,
        price,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        status: 'active',
        auto_renew: false,
        renewal_reminder_sent_at: null,
      })
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, subscription: data as SubscriptionRow }
  }

  const base = new Date(existing.current_period_end)
  const extendFrom = base > now ? base : now
  const periodEnd = addBillingPeriod(extendFrom, period)

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      price,
      billing_period: period,
      current_period_start: extendFrom.toISOString(),
      current_period_end: periodEnd.toISOString(),
      renewal_reminder_sent_at: null,
    })
    .eq('id', existing.id)
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, subscription: data as SubscriptionRow }
}

export async function onPurchaseCompleted(
  supabase: SupabaseClient,
  purchase: {
    product_id: string
    buyer_profile_id?: string | null
    simple_user_id?: string | null
    amount: number
  },
): Promise<void> {
  const buyerProfileId = purchase.buyer_profile_id
  if (!buyerProfileId) return
  if (!(await isSubscriptionProduct(supabase, purchase.product_id))) return

  const result = await activateOrExtendSubscription(supabase, {
    productId: purchase.product_id,
    buyerProfileId,
    price: purchase.amount,
  })
  if (!result.ok) {
    console.error('subscription activation failed', result.error)
  }
}

/**
 * A seller keeps one schedule for all their products, so the author's schedule (teacher_id
 * null) is open to anyone with access to any product of that seller. Teacher schedules stay
 * tied to their own product.
 */
export async function buyerScheduleScope(
  supabase: SupabaseClient,
  buyerProfileId: string,
): Promise<{ productIds: string[]; creatorAccountIds: string[] }> {
  const productIds = await buyerAccessibleProductIds(supabase, buyerProfileId)
  if (!productIds.length) return { productIds, creatorAccountIds: [] }
  const { data } = await supabase.from('products').select('creator_account_id').in('id', productIds)
  const creatorAccountIds = [
    ...new Set((data ?? []).map((p: { creator_account_id: string | null }) => p.creator_account_id).filter(Boolean)),
  ] as string[]
  return { productIds, creatorAccountIds }
}

/** Schedule ids from `scheduleIds` the buyer may see and book into. */
export async function buyerUsableScheduleIds(
  supabase: SupabaseClient,
  buyerProfileId: string,
  scheduleIds: string[],
): Promise<string[]> {
  if (!scheduleIds.length) return []
  const scope = await buyerScheduleScope(supabase, buyerProfileId)
  if (!scope.productIds.length) return []
  const { data } = await supabase
    .from('schedules')
    .select('id, product_id, teacher_id, product:products(creator_account_id)')
    .in('id', scheduleIds)
  const creators = new Set(scope.creatorAccountIds)
  type Row = {
    id: string
    product_id: string
    teacher_id: string | null
    product: { creator_account_id: string | null } | { creator_account_id: string | null }[] | null
  }
  const creatorOf = (row: Row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product
    return product?.creator_account_id ?? null
  }
  return ((data ?? []) as unknown as Row[])
    .filter((s) => {
      if (scope.productIds.includes(s.product_id)) return true
      const creator = creatorOf(s)
      return !s.teacher_id && !!creator && creators.has(creator)
    })
    .map((s) => s.id)
}
