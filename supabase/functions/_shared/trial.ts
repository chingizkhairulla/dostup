import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { activeBuyerIds, seatsFull } from './productBuyers.ts'
import { subscriptionGrantsAccess, trialOpen } from './subscription.ts'

export type TrialMode = 'lesson' | 'period'
export type ApplicationStatus = 'pending' | 'allowed' | 'closed' | 'removed' | 'left'

export type TrialProduct = {
  id: string
  title?: string | null
  creator_account_id?: string | null
  has_free_trial?: boolean | null
  trial_mode?: TrialMode | null
  trial_days?: number | null
  trial_button_text?: string | null
  max_buyers?: number | null
  sales_closed?: boolean | null
  waitlist_auto_open?: boolean | null
  waitlist_pay_days?: number | null
}

export const TRIAL_PRODUCT_COLUMNS =
  'id, title, creator_account_id, has_free_trial, trial_mode, trial_days, trial_button_text, max_buyers, sales_closed, waitlist_auto_open, waitlist_pay_days'

export const TRIAL_DEFAULT_TEXT: Record<TrialMode, string> = {
  lesson: 'Записаться на пробный урок',
  period: 'Получить пробный доступ',
}

/** The product's trial kind; an old trial set in days counts as "period". */
export function trialModeOf(product: TrialProduct): TrialMode | null {
  if (product.trial_mode === 'lesson' || product.trial_mode === 'period') return product.trial_mode
  return product.has_free_trial && product.trial_days ? 'period' : null
}

/**
 * Where a buyer stands with a product, which is what the storefront button and the server's
 * payment check are built from.
 */
export type BuyerProductState = {
  trialMode: TrialMode | null
  /** 'none' never took the trial; 'active' is on it; 'ended' it is over. */
  trial: 'none' | 'active' | 'ended'
  trialEndsAt: string | null
  /** Lesson trial: the seller confirmed the trial lesson took place. */
  lessonHeld: boolean
  /** Paid access right now (a seat holder). */
  paidActive: boolean
  /** Paid before and the access ran out by itself (may buy again past "no seats"). */
  paidBefore: boolean
  /** The seller closed this buyer's access by hand. */
  revoked: boolean
  application: { status: ApplicationStatus; appliedAt: string } | null
  seatsFull: boolean
  salesClosed: boolean
}

export async function buyerProductState(
  supabase: SupabaseClient,
  product: TrialProduct,
  buyerId: string,
): Promise<BuyerProductState> {
  const [{ data: purchases }, { data: sub }, { data: application }, { data: trialRow }, { data: held }, full] =
    await Promise.all([
      supabase
        .from('simple_purchases')
        .select('id, status, is_trial, trial_ends_at, access_expires_at')
        .eq('product_id', product.id)
        .eq('buyer_profile_id', buyerId),
      supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('product_id', product.id)
        .eq('buyer_profile_id', buyerId)
        .maybeSingle(),
      supabase
        .from('product_applications')
        .select('status, applied_at')
        .eq('product_id', product.id)
        .eq('buyer_profile_id', buyerId)
        .maybeSingle(),
      supabase
        .from('product_trials')
        .select('ends_at')
        .eq('product_id', product.id)
        .eq('buyer_profile_id', buyerId)
        .maybeSingle(),
      supabase
        .from('trial_lesson_checks')
        .select('id')
        .eq('product_id', product.id)
        .eq('buyer_profile_id', buyerId)
        .eq('held', true)
        .limit(1),
      seatsFull(supabase, product),
    ])

  const rows = (purchases ?? []) as {
    status: string
    is_trial: boolean | null
    trial_ends_at: string | null
    access_expires_at: string | null
  }[]
  const trialPurchase = rows.find((r) => r.is_trial && r.status === 'completed')
  const paidRows = rows.filter((r) => !r.is_trial && (r.status === 'completed' || r.status === 'revoked'))
  const revoked = paidRows.some((r) => r.status === 'revoked')
  const paidActive = paidRows.some((r) => {
    if (r.status !== 'completed') return false
    if (sub) return subscriptionGrantsAccess(sub as never)
    return !r.access_expires_at || new Date(r.access_expires_at) > new Date()
  })

  let trial: BuyerProductState['trial'] = 'none'
  if (trialPurchase) trial = trialOpen(trialPurchase) ? 'active' : 'ended'
  else if (trialRow) trial = 'ended'

  return {
    trialMode: trialModeOf(product),
    trial,
    trialEndsAt: trialPurchase?.trial_ends_at ?? (trialRow?.ends_at as string | undefined) ?? null,
    lessonHeld: (held ?? []).length > 0,
    paidActive,
    paidBefore: paidRows.some((r) => r.status === 'completed') && !paidActive,
    revoked,
    application: application
      ? { status: application.status as ApplicationStatus, appliedAt: application.applied_at as string }
      : null,
    seatsFull: full,
    salesClosed: Boolean(product.sales_closed),
  }
}

/** Shut out for good: removed from the waiting list by the seller, or left it. */
export const shutOut = (s: BuyerProductState) => s.application?.status === 'removed' || s.application?.status === 'left'

/**
 * Whether this buyer may pay for the product now (checked on the server for every purchase and
 * receipt, not only by hiding the button):
 * - sales ended: nobody;
 * - shut out of the waiting list: no;
 * - a seat holder or someone whose paid access simply ran out: yes;
 * - "lesson" trial ("only with permission"): only with the seller's personal permission;
 * - with a trial: only after taking it; a free seat is needed unless the seller allowed payment;
 * - without a trial: a free seat.
 */
export function paymentDecision(s: BuyerProductState): { ok: true } | { ok: false; code: string; error: string } {
  if (s.salesClosed) return { ok: false, code: 'sales_closed', error: 'Мест нет' }
  if (shutOut(s)) return { ok: false, code: 'shut_out', error: 'Мест нет' }
  if (s.revoked && s.application?.status !== 'allowed') return { ok: false, code: 'revoked', error: 'Мест нет' }
  if (s.paidActive || s.paidBefore) return { ok: true }
  const allowed = s.application?.status === 'allowed'
  if (s.trialMode === 'lesson') {
    return allowed ? { ok: true } : { ok: false, code: 'permission_required', error: 'Оплата откроется после разрешения продавца' }
  }
  if (s.trialMode === 'period' && s.trial === 'none' && !allowed) {
    return { ok: false, code: 'trial_first', error: 'Сначала получите пробный доступ' }
  }
  if (s.seatsFull && !allowed) return { ok: false, code: 'no_seats', error: 'Мест нет' }
  return { ok: true }
}

/** Whether this buyer may start the trial now. */
export function trialDecision(s: BuyerProductState): { ok: true } | { ok: false; code: string; error: string } {
  if (!s.trialMode) return { ok: false, code: 'no_trial', error: 'Пробный доступ недоступен' }
  if (s.salesClosed || shutOut(s)) return { ok: false, code: 'no_seats', error: 'Мест нет' }
  if (s.trial !== 'none' || s.paidActive || s.paidBefore) {
    return { ok: false, code: 'trial_already_used', error: 'Пробный доступ уже был использован' }
  }
  if (s.seatsFull) return { ok: false, code: 'no_seats', error: 'Мест нет' }
  return { ok: true }
}

/** A platform notification for a buyer or a seller (shown in their notifications, plus a push). */
export async function notify(
  supabase: SupabaseClient,
  to: { buyerProfileId?: string; creatorAccountId?: string },
  input: { productId?: string | null; kind: string; title: string; body?: string },
) {
  const { error } = await supabase.from('app_notifications').insert({
    buyer_profile_id: to.buyerProfileId ?? null,
    creator_account_id: to.creatorAccountId ?? null,
    product_id: input.productId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body ?? '',
  })
  if (error) console.error('notification insert failed', error)
  // Seller push tokens carry no account id (a push to "creator" reaches every seller), so
  // sellers get the notification in the app only; buyers also get a push.
  if (!to.buyerProfileId) return
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return
    await fetch(`${url}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        userId: to.buyerProfileId,
        title: input.title,
        body: input.body ?? '',
        data: { type: input.kind, productId: input.productId ?? '' },
      }),
    })
  } catch (e) {
    console.error('push failed', e)
  }
}

/**
 * A personal message from the seller, sent by the platform (e.g. "trial access is open" or the
 * reason for the waiting list). Uses the same thread the seller and buyer chat in.
 */
export async function sendSellerMessage(
  supabase: SupabaseClient,
  creatorAccountId: string,
  buyerProfileId: string,
  text: string,
) {
  let { data: thread } = await supabase
    .from('direct_threads')
    .select('id, unread_for_buyer')
    .eq('creator_account_id', creatorAccountId)
    .eq('buyer_profile_id', buyerProfileId)
    .maybeSingle()
  if (!thread) {
    const created = await supabase
      .from('direct_threads')
      .insert({ creator_account_id: creatorAccountId, buyer_profile_id: buyerProfileId })
      .select('id, unread_for_buyer')
      .maybeSingle()
    thread = created.data ?? (
      await supabase
        .from('direct_threads')
        .select('id, unread_for_buyer')
        .eq('creator_account_id', creatorAccountId)
        .eq('buyer_profile_id', buyerProfileId)
        .maybeSingle()
    ).data
  }
  if (!thread) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('direct_messages')
    .insert({ thread_id: thread.id, sender: 'creator', text, attachments: [], created_at: now })
  if (error) {
    console.error('seller message failed', error)
    return
  }
  await supabase
    .from('direct_threads')
    .update({
      last_message_at: now,
      last_message_preview: text.slice(0, 200),
      unread_for_buyer: Number(thread.unread_for_buyer ?? 0) + 1,
    })
    .eq('id', thread.id)
}

/**
 * After a paid purchase is confirmed: the trial row gives way to the paid one, the buyer leaves
 * the waiting list, and if the seller allowed more people than there were seats, the limit grows
 * so that everyone who was allowed and paid fits.
 */
export async function afterPaidPurchase(
  supabase: SupabaseClient,
  purchase: { id?: string; product_id: string; buyer_profile_id: string | null },
) {
  if (!purchase.buyer_profile_id) return
  let trials = supabase
    .from('simple_purchases')
    .delete()
    .eq('product_id', purchase.product_id)
    .eq('buyer_profile_id', purchase.buyer_profile_id)
    .eq('is_trial', true)
  if (purchase.id) trials = trials.neq('id', purchase.id)
  await trials
  await supabase
    .from('product_applications')
    .delete()
    .eq('product_id', purchase.product_id)
    .eq('buyer_profile_id', purchase.buyer_profile_id)
    .in('status', ['pending', 'allowed', 'closed'])

  const { data: product } = await supabase
    .from('products')
    .select('id, max_buyers')
    .eq('id', purchase.product_id)
    .maybeSingle()
  if (!product || product.max_buyers == null) return
  const paid = await activeBuyerIds(supabase, product.id, { includeTrials: false })
  if (paid.length > product.max_buyers) {
    await supabase.from('products').update({ max_buyers: paid.length }).eq('id', product.id)
  }
}
