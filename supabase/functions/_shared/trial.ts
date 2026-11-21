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

/**
 * Seats became free (the seller closed someone's access, raised "Максимальное число
 * покупателей", a subscription ran out, an opened payment expired) and people wait in the list.
 * - "Период времени" with auto-opening on: payment opens for the oldest requests, one per free
 *   seat, for `waitlist_pay_days` days; each gets a notification, the seller one summary.
 * - Otherwise nobody is let in automatically: the seller is told how many people they may allow.
 * A payment opened but not yet used holds no seat, yet it is counted here so the same seat is not
 * offered twice.
 */
export async function releaseSeats(
  supabase: SupabaseClient,
  productId: string,
  { skipBuyerIds = [] as string[] } = {},
) {
  const { data: product } = await supabase.from('products').select(TRIAL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
  if (!product || product.sales_closed) return

  const { data: apps } = await supabase
    .from('product_applications')
    .select('id, buyer_profile_id, status, applied_at')
    .eq('product_id', productId)
    .in('status', ['allowed', 'closed'])
    .order('applied_at', { ascending: true })
  const rows = (apps ?? []) as { id: string; buyer_profile_id: string; status: string }[]
  const waiting = rows.filter((r) => r.status === 'closed' && !skipBuyerIds.includes(r.buyer_profile_id))
  if (!waiting.length) return

  let free = Number.POSITIVE_INFINITY
  if (product.max_buyers != null) {
    const paid = await activeBuyerIds(supabase, productId, { includeTrials: false })
    const opened = rows.filter((r) => r.status === 'allowed').length
    free = product.max_buyers - paid.length - opened
  }
  if (free <= 0) return
  const count = Math.min(free, waiting.length)
  const title = product.title ?? ''

  if (trialModeOf(product) === 'period' && product.waitlist_auto_open) {
    const lucky = waiting.slice(0, count)
    const payUntil = new Date(Date.now() + Math.max(1, Number(product.waitlist_pay_days) || 7) * 86400000).toISOString()
    const now = new Date().toISOString()
    await supabase
      .from('product_applications')
      .update({ status: 'allowed', decided_at: now, pay_until: payUntil })
      .in('id', lucky.map((r) => r.id))
    for (const r of lucky) {
      await notify(supabase, { buyerProfileId: r.buyer_profile_id }, {
        productId,
        kind: 'seat_opened',
        title: 'Место освободилось!',
        body: `Теперь вы можете оплатить ${title} в разделе "Покупки"`,
      })
    }
    if (product.creator_account_id) {
      await notify(supabase, { creatorAccountId: product.creator_account_id }, {
        productId,
        kind: 'seats_auto_opened',
        title: 'Места освободились',
        body: `Оплата автоматически открыта ${count} покупателям из листа ожидания`,
      })
    }
    return
  }

  if (product.creator_account_id) {
    await notify(supabase, { creatorAccountId: product.creator_account_id }, {
      productId,
      kind: 'seats_free',
      title: 'Места освободились',
      body: `Вы можете разрешить оплату ${count} людям, стоящих в листе ожидания`,
    })
  }
}

/**
 * Daily housekeeping run by process-subscriptions: "Пробный доступ окончен" for trials that ran
 * out, payments opened automatically and not used in time go back to the waiting list, and the
 * seats freed by all that are offered to the next people in line.
 */
export async function processTrialsAndWaitlists(supabase: SupabaseClient) {
  const now = new Date().toISOString()
  const touched = new Set<string>()

  const { data: endedTrials } = await supabase
    .from('simple_purchases')
    .select('id, product_id, buyer_profile_id')
    .eq('is_trial', true)
    .eq('status', 'completed')
    .lte('trial_ends_at', now)
    .is('trial_end_notified_at', null)
    .limit(500)
  for (const t of (endedTrials ?? []) as { id: string; product_id: string; buyer_profile_id: string | null }[]) {
    if (t.buyer_profile_id) {
      await notify(supabase, { buyerProfileId: t.buyer_profile_id }, {
        productId: t.product_id,
        kind: 'trial_ended',
        title: 'Пробный доступ окончен',
      })
    }
    await supabase.from('simple_purchases').update({ trial_end_notified_at: now }).eq('id', t.id)
  }

  const { data: expired } = await supabase
    .from('product_applications')
    .select('id, product_id, buyer_profile_id')
    .eq('status', 'allowed')
    .lte('pay_until', now)
    .limit(500)
  const backToList = (expired ?? []) as { id: string; product_id: string; buyer_profile_id: string }[]
  if (backToList.length) {
    await supabase
      .from('product_applications')
      .update({ status: 'closed', pay_until: null, decided_at: now })
      .in('id', backToList.map((r) => r.id))
    for (const r of backToList) touched.add(r.product_id)
  }

  for (const productId of touched) {
    await releaseSeats(supabase, productId, {
      skipBuyerIds: backToList.filter((r) => r.product_id === productId).map((r) => r.buyer_profile_id),
    })
  }
  return { trialsEnded: (endedTrials ?? []).length, paymentsClosed: backToList.length }
}

/** Slot times are stored as local Kazakhstan wall-clock time (UTC+5). */
const SLOT_UTC_OFFSET = '+05:00'

export function slotMoment(date: string, time: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8)
  return new Date(`${date}T${hhmmss}${SLOT_UTC_OFFSET}`)
}

/**
 * Booking rules while a buyer is on a trial (no paid access):
 * - "lesson": one slot at a time; another only after the seller answered "Нет" about it;
 * - "period": any number of slots, but none that starts after the trial ends.
 */
export async function trialBookingCheck(
  supabase: SupabaseClient,
  buyerId: string,
  productId: string,
  slot: { date: string; start_time: string },
): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const { data: product } = await supabase.from('products').select(TRIAL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
  if (!product) return { ok: true }
  const state = await buyerProductState(supabase, product, buyerId)
  if (state.paidActive || state.trial !== 'active') return { ok: true }

  if (state.trialMode === 'period') {
    if (state.trialEndsAt && slotMoment(slot.date, slot.start_time) > new Date(state.trialEndsAt)) {
      return {
        ok: false,
        code: 'trial_ends_before_slot',
        error: 'К сожалению, к тому времени пробный доступ закончится. Оплатите продукт, чтобы записаться на слот',
      }
    }
    return { ok: true }
  }

  const { data: schedules } = await supabase.from('schedules').select('id').eq('product_id', productId)
  const scheduleIds = ((schedules ?? []) as { id: string }[]).map((s) => s.id)
  if (!scheduleIds.length) return { ok: true }
  const { data: bookings } = await supabase
    .from('simple_bookings')
    .select('time_slot_id')
    .eq('buyer_profile_id', buyerId)
    .in('schedule_id', scheduleIds)
    .eq('status', 'confirmed')
  const slotIds = ((bookings ?? []) as { time_slot_id: string }[]).map((b) => b.time_slot_id)
  if (!slotIds.length) return { ok: true }
  const { data: answered } = await supabase
    .from('trial_lesson_checks')
    .select('time_slot_id')
    .eq('buyer_profile_id', buyerId)
    .in('time_slot_id', slotIds)
  const done = new Set(((answered ?? []) as { time_slot_id: string }[]).map((a) => a.time_slot_id))
  if (slotIds.some((id) => !done.has(id))) {
    return { ok: false, code: 'trial_one_slot', error: 'На пробном можно записаться только на один слот' }
  }
  return { ok: true }
}

/**
 * "Пробный урок прошёл?" for the seller: lesson-trial bookings whose slot is over, the buyer did
 * not cancel, and the seller has not answered yet.
 */
export async function pendingTrialLessonChecks(supabase: SupabaseClient, creatorAccountId: string) {
  const { data: products } = await supabase
    .from('products')
    .select('id, title')
    .eq('creator_account_id', creatorAccountId)
    .eq('trial_mode', 'lesson')
  const productList = (products ?? []) as { id: string; title: string }[]
  if (!productList.length) return []
  const productIds = productList.map((p) => p.id)

  const { data: trials } = await supabase
    .from('simple_purchases')
    .select('product_id, buyer_profile_id, trial_ends_at')
    .in('product_id', productIds)
    .eq('is_trial', true)
    .eq('status', 'completed')
    .is('trial_ends_at', null)
  const onTrial = new Set(
    ((trials ?? []) as { product_id: string; buyer_profile_id: string | null }[])
      .filter((t) => t.buyer_profile_id)
      .map((t) => `${t.product_id}:${t.buyer_profile_id}`),
  )
  if (!onTrial.size) return []

  const { data: schedules } = await supabase.from('schedules').select('id, product_id').in('product_id', productIds)
  const productBySchedule = new Map(((schedules ?? []) as { id: string; product_id: string }[]).map((s) => [s.id, s.product_id]))
  if (!productBySchedule.size) return []
  const { data: bookings } = await supabase
    .from('simple_bookings')
    .select('buyer_profile_id, schedule_id, time_slot_id, time_slots (date, start_time, end_time)')
    .in('schedule_id', [...productBySchedule.keys()])
    .eq('status', 'confirmed')
  const now = new Date()
  const candidates = ((bookings ?? []) as unknown as {
    buyer_profile_id: string | null
    schedule_id: string
    time_slot_id: string
    time_slots: { date: string; start_time: string; end_time: string } | null
  }[]).filter((b) => {
    if (!b.buyer_profile_id || !b.time_slots) return false
    const productId = productBySchedule.get(b.schedule_id)!
    return onTrial.has(`${productId}:${b.buyer_profile_id}`) && slotMoment(b.time_slots.date, b.time_slots.end_time) <= now
  })
  if (!candidates.length) return []

  const { data: answered } = await supabase
    .from('trial_lesson_checks')
    .select('time_slot_id, buyer_profile_id')
    .in('time_slot_id', candidates.map((c) => c.time_slot_id))
  const done = new Set(((answered ?? []) as { time_slot_id: string; buyer_profile_id: string }[]).map((a) => `${a.time_slot_id}:${a.buyer_profile_id}`))
  const open = candidates.filter((c) => !done.has(`${c.time_slot_id}:${c.buyer_profile_id}`))
  if (!open.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...new Set(open.map((c) => c.buyer_profile_id!))])
  const nameById = new Map(((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]))
  const titleById = new Map(productList.map((p) => [p.id, p.title]))
  return open.map((c) => {
    const productId = productBySchedule.get(c.schedule_id)!
    return {
      product_id: productId,
      product_title: titleById.get(productId) ?? '',
      buyer_profile_id: c.buyer_profile_id!,
      buyer_name: nameById.get(c.buyer_profile_id!) || 'Покупатель',
      time_slot_id: c.time_slot_id,
      date: c.time_slots!.date,
      start_time: c.time_slots!.start_time,
      end_time: c.time_slots!.end_time,
    }
  })
}

/** The seller's answer. "Да" closes the lesson trial; "Нет" lets the buyer book another slot. */
export async function answerTrialLessonCheck(
  supabase: SupabaseClient,
  input: { productId: string; buyerProfileId: string; timeSlotId: string; held: boolean },
) {
  const { error } = await supabase.from('trial_lesson_checks').upsert(
    {
      product_id: input.productId,
      buyer_profile_id: input.buyerProfileId,
      time_slot_id: input.timeSlotId,
      held: input.held,
      answered_at: new Date().toISOString(),
    },
    { onConflict: 'time_slot_id,buyer_profile_id' },
  )
  if (error) throw error
  if (!input.held) return
  const now = new Date().toISOString()
  await supabase
    .from('simple_purchases')
    .update({ trial_ends_at: now, trial_end_notified_at: now })
    .eq('product_id', input.productId)
    .eq('buyer_profile_id', input.buyerProfileId)
    .eq('is_trial', true)
    .is('trial_ends_at', null)
  await notify(supabase, { buyerProfileId: input.buyerProfileId }, {
    productId: input.productId,
    kind: 'trial_ended',
    title: 'Пробный доступ окончен',
  })
}
