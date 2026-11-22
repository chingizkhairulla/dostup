import { json, optionsResponse } from '../_shared/http.ts'
import {
  CHECKOUT_COLUMNS,
  resolveUser,
  serviceClient,
  unauthorized,
} from '../_shared/session.ts'
import { latestSubmissionForPurchase } from '../_shared/purchase.ts'
import {
  buyerProductState,
  notify,
  paymentDecision,
  sendSellerMessage,
  shutOut,
  TRIAL_OPEN_MESSAGE,
  TRIAL_PRODUCT_COLUMNS,
  trialDecision,
} from '../_shared/trial.ts'
import {
  isSubscriptionProduct,
  purchaseAccessOpen,
  subscriptionGrantsAccess,
  trialOpen,
  type SubscriptionRow,
} from '../_shared/subscription.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : 'get_product'
    const supabase = serviceClient()

    if (action === 'get_product') {
      const idOrSlug = String(body.idOrSlug || body.productId || '').trim()
      if (!idOrSlug) return json({ error: 'Missing product' }, 400)

      let { data } = await supabase
        .from('products')
        .select(CHECKOUT_COLUMNS)
        .eq('slug', idOrSlug)
        .eq('is_active', true)
        .maybeSingle()

      if (!data) {
        const result = await supabase
          .from('products')
          .select(CHECKOUT_COLUMNS)
          .eq('id', idOrSlug)
          .eq('is_active', true)
          .maybeSingle()
        data = result.data
      }

      if (data?.is_paused) {
        const { kaspi_link: _l, kaspi_phone: _p, pricing_options, ...rest } = data as Record<string, unknown>
        const strippedOptions = Array.isArray(pricing_options)
          ? pricing_options.map((opt) => {
              const { kaspi_link: _ol, kaspi_phone: _op, kaspi_card: _oc, bank: _b, bank_name: _bn, ...optRest } =
                (opt ?? {}) as Record<string, unknown>
              return optRest
            })
          : pricing_options
        return json({ product: { ...rest, kaspi_link: null, kaspi_phone: null, pricing_options: strippedOptions } })
      }

      return json({ product: data })
    }

    if (action === 'lookup_teacher') {
      const productId = String(body.productId || '').trim()
      const teacherName = String(body.teacherName || '').trim()
      if (!productId || !teacherName) return json({ teacherId: null })

      const { data: assigned } = await supabase
        .from('product_teachers')
        .select('teacher_name')
        .eq('product_id', productId)
        .ilike('teacher_name', teacherName)
        .maybeSingle()
      if (!assigned) return json({ teacherId: null })

      const { data: user } = await supabase
        .from('simple_users')
        .select('id')
        .ilike('name', teacherName)
        .eq('role', 'teacher')
        .maybeSingle()
      return json({ teacherId: user?.id ?? null })
    }

    const user = await resolveUser(supabase, String(body.sessionToken || ''))
    if (!user) return unauthorized()

    if (action === 'set_role') {
      const role = body.role === 'creator' ? 'creator' : 'student'
      const { error } = await supabase.from('simple_users').update({ role }).eq('id', user.userId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, role })
    }

    if (action === 'list_my_purchases') {
      const { data, error } = await supabase
        .from('simple_purchases')
        .select('id, product_id, status, amount, created_at, can_choose_teacher, assigned_teacher_id, access_expires_at, is_trial, trial_ends_at')
        .eq('buyer_profile_id', user.userId)
        .eq('status', body.status || 'completed')
      if (error) return json({ error: error.message }, 500)
      // Access the seller ended, or a trial that is over, is no longer "mine" on the buyer's side.
      const rows = (body.status || 'completed') === 'completed'
        ? (data ?? []).filter((p: { access_expires_at?: string | null; is_trial?: boolean | null; trial_ends_at?: string | null }) =>
            p.is_trial ? trialOpen(p) : purchaseAccessOpen(p))
        : data ?? []
      if (!rows.length) return json({ purchases: [] })
      const productIds = rows.map((p: { product_id: string }) => p.product_id)
      const { data: products } = await supabase
        .from('products')
        .select('id, title, headline, telegram_link, group_link_label')
        .in('id', productIds)
      return json({
        purchases: rows.map((purchase: { product_id: string; is_trial?: boolean | null }) => {
          const product = products?.find((p: { id: string }) => p.id === purchase.product_id) || null
          // The group link goes out only after a purchase; a trial does not get it.
          return {
            ...purchase,
            product: product && purchase.is_trial ? { ...product, telegram_link: null } : product,
          }
        }),
      })
    }

    if (action === 'get_my_purchase') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)
      let { data } = await supabase
        .from('simple_purchases')
        .select('*')
        .eq('buyer_profile_id', user.userId)
        .eq('product_id', productId)
        .maybeSingle()
      if (!data) {
        const fallback = await supabase
          .from('simple_purchases')
          .select('*')
          .eq('simple_user_id', user.userId)
          .eq('product_id', productId)
          .maybeSingle()
        data = fallback.data
      }
      if (!data) return json({ purchase: null })
      const submission = await latestSubmissionForPurchase(supabase, data.id)
      return json({ purchase: { ...data, latest_submission: submission } })
    }

    if (action === 'list_my_subscriptions') {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('buyer_profile_id', user.userId)
        .order('current_period_end', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ subscriptions: [] })
      const productIds = data.map((s: { product_id: string }) => s.product_id)
      const { data: products } = await supabase
        .from('products')
        .select('id, title, headline, telegram_link, group_link_label, slug, billing_period, price')
        .in('id', productIds)
      return json({
        subscriptions: (data as SubscriptionRow[]).map((sub) => ({
          ...sub,
          has_access: subscriptionGrantsAccess(sub),
          product: products?.find((p: { id: string }) => p.id === sub.product_id) || null,
        })),
      })
    }

    if (action === 'cancel_subscription') {
      const subscriptionId = String(body.subscriptionId || '').trim()
      if (!subscriptionId) return json({ error: 'Missing subscriptionId' }, 400)
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, buyer_profile_id, status')
        .eq('id', subscriptionId)
        .maybeSingle()
      if (!sub || sub.buyer_profile_id !== user.userId) return json({ error: 'Not found' }, 404)
      if (sub.status === 'cancelled') return json({ ok: true })
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', subscriptionId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'create_purchase') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)

      const { data: product } = await supabase
        .from('products')
        .select(`price, is_active, is_paused, ${TRIAL_PRODUCT_COLUMNS}`)
        .eq('id', productId)
        .maybeSingle()
      if (!product || !product.is_active || product.is_paused) {
        return json({ error: 'Product unavailable' }, 400)
      }
      // The same rules as the storefront button, checked here so a direct call cannot skip them:
      // ended sales, no seats, "only with permission" without the seller's permission, etc.
      const state = await buyerProductState(supabase, product, user.userId)
      const decision = paymentDecision(state)
      if (!decision.ok) return json({ error: decision.error, code: decision.code }, 409)

      const isSub = await isSubscriptionProduct(supabase, productId)

      if (isSub) {
        const { data: pending } = await supabase
          .from('simple_purchases')
          .select('id, status')
          .eq('buyer_profile_id', user.userId)
          .eq('product_id', productId)
          .eq('status', 'pending')
          .maybeSingle()
        if (pending) return json({ purchase: pending })
      } else {
        // The trial row stays until the payment is confirmed; the purchase is a row of its own.
        const { data: existing } = await supabase
          .from('simple_purchases')
          .select('id, status')
          .eq('buyer_profile_id', user.userId)
          .eq('product_id', productId)
          .or('is_trial.is.null,is_trial.eq.false')
          .maybeSingle()
        if (existing) return json({ purchase: existing })
      }

      const insertData: Record<string, unknown> = {
        buyer_profile_id: user.userId,
        product_id: productId,
        amount: product.price || 0,
        status: 'pending',
      }
      if (typeof body.assignedTeacherId === 'string' && body.assignedTeacherId) {
        insertData.assigned_teacher_id = body.assignedTeacherId
      }
      if (body.canChooseTeacher === true) insertData.can_choose_teacher = true

      const { data, error } = await supabase
        .from('simple_purchases')
        .insert(insertData)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ purchase: data })
    }

    if (action === 'cancel_pending') {
      const purchaseId = String(body.purchaseId || '').trim()
      if (!purchaseId) return json({ error: 'Missing purchaseId' }, 400)
      const { error } = await supabase
        .from('simple_purchases')
        .delete()
        .eq('id', purchaseId)
        .eq('buyer_profile_id', user.userId)
        .eq('status', 'pending')
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // Everything the storefront button needs for this buyer: trial, application, seats, payment.
    if (action === 'storefront_state' || action === 'seat_status' || action === 'check_trial') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)
      const { data: product } = await supabase.from('products').select(TRIAL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
      if (!product) return json({ error: 'Not found' }, 404)
      const state = await buyerProductState(supabase, product, user.userId)
      const pay = paymentDecision(state)
      const trial = trialDecision(state)
      return json({
        ...state,
        canBuy: pay.ok,
        payCode: pay.ok ? null : pay.code,
        canStartTrial: trial.ok,
        // Older clients read these.
        hasFreeTrial: Boolean(state.trialMode),
        hasUsedTrial: state.trial !== 'none',
        canUseTrial: trial.ok,
        trialDays: product.trial_days ?? null,
      })
    }

    // "Подать заявку": after the trial lesson ("lesson" kind) the request waits for the seller in
    // Platform notifications for this buyer ("Пробный доступ окончен", "Вам открыли оплату…").
    if (action === 'list_notifications') {
      const { data, error } = await supabase
        .from('app_notifications')
        .select('id, product_id, kind, title, body, params, created_at')
        .eq('buyer_profile_id', user.userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return json({ error: error.message }, 500)
      return json({ notifications: data ?? [] })
    }

    // "Ожидающие"; when the seats ran out during a "period" trial it joins the waiting list.
    if (action === 'apply') {
      const productId = String(body.productId || '').trim()
      if (!productId || body.wantToPay !== true) return json({ error: 'Bad input' }, 400)
      const { data: product } = await supabase.from('products').select(TRIAL_PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
      if (!product) return json({ error: 'Not found' }, 404)
      const state = await buyerProductState(supabase, product, user.userId)
      if (state.salesClosed || shutOut(state)) return json({ error: 'Мест нет', code: 'no_seats' }, 409)
      if (state.application) return json({ ok: true, status: state.application.status })
      if (state.trial === 'none') return json({ error: 'Сначала получите пробный доступ', code: 'trial_first' }, 409)
      let status: 'pending' | 'closed'
      if (state.trialMode === 'lesson') {
        if (!state.lessonHeld) return json({ error: 'Доступно после пробного урока', code: 'lesson_not_held' }, 409)
        status = 'pending'
      } else {
        if (paymentDecision(state).ok) return json({ error: 'Оплата уже доступна', code: 'can_pay' }, 409)
        status = 'closed'
      }
      const { error } = await supabase.from('product_applications').insert({
        product_id: productId,
        buyer_profile_id: user.userId,
        status,
        applied_at: new Date().toISOString(),
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, status })
    }

    // "Выйти" from the waiting list: gone from the seller's lists for good, no new trial or purchase.
    if (action === 'leave_waitlist') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)
      const { data: application } = await supabase
        .from('product_applications')
        .select('id, status')
        .eq('product_id', productId)
        .eq('buyer_profile_id', user.userId)
        .maybeSingle()
      if (!application || !['allowed', 'closed', 'pending'].includes(application.status)) {
        return json({ error: 'Not in the waiting list' }, 409)
      }
      await supabase
        .from('product_applications')
        .update({ status: 'left', decided_at: new Date().toISOString(), pay_until: null })
        .eq('id', application.id)
      const { data: product } = await supabase.from('products').select('id, title, creator_account_id').eq('id', productId).maybeSingle()
      const { data: me } = await supabase.from('profiles').select('display_name').eq('id', user.userId).maybeSingle()
      if (product?.creator_account_id) {
        await notify(supabase, { creatorAccountId: product.creator_account_id }, {
          productId,
          kind: 'waitlist_left',
          title: `${me?.display_name || 'Покупатель'} вышел из листа ожидания`,
          body: product.title ?? '',
          params: { name: me?.display_name || 'Покупатель', product: product.title ?? '' },
        })
      }
      return json({ ok: true })
    }

    if (action === 'activate_trial') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)

      const { data: product } = await supabase
        .from('products')
        .select(`is_active, is_paused, ${TRIAL_PRODUCT_COLUMNS}`)
        .eq('id', productId)
        .maybeSingle()
      if (!product || !product.is_active || product.is_paused) {
        return json({ error: 'Product unavailable' }, 400)
      }
      const { data: profile } = await supabase.from('profiles').select('type').eq('id', user.userId).maybeSingle()
      if (profile?.type !== 'buyer') return json({ error: 'Переключитесь на профиль покупателя', code: 'not_buyer' }, 403)

      const state = await buyerProductState(supabase, product, user.userId)
      const decision = trialDecision(state)
      if (!decision.ok) return json({ error: decision.error, code: decision.code, message: decision.error }, 409)

      // The name the person gave in the trial window becomes their buyer profile name.
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : ''
      if (displayName) await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.userId)

      const mode = state.trialMode!
      const now = new Date()
      const days = mode === 'period' ? Math.max(1, Number(product.trial_days) || 7) : null
      // "Lesson" has no end date: it closes when the seller confirms the trial lesson took place.
      const endsAt = days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString() : null

      const { error: trialError } = await supabase.from('product_trials').insert({
        product_id: productId,
        buyer_profile_id: user.userId,
        trial_days: days,
        starts_at: now.toISOString(),
        ends_at: endsAt,
      })
      if (trialError) {
        return json({ error: 'trial_already_used', message: 'Пробный доступ уже был использован' }, 409)
      }

      const { error: purchaseError } = await supabase.from('simple_purchases').insert({
        buyer_profile_id: user.userId,
        product_id: productId,
        amount: 0,
        status: 'completed',
        is_trial: true,
        trial_ends_at: endsAt,
        confirmed_at: now.toISOString(),
      })
      if (purchaseError) {
        await supabase.from('product_trials').delete().eq('product_id', productId).eq('buyer_profile_id', user.userId)
        return json({ error: purchaseError.message }, 500)
      }

      if (product.creator_account_id) {
        await sendSellerMessage(
          supabase,
          product.creator_account_id,
          user.userId,
          TRIAL_OPEN_MESSAGE[body.lang === 'kk' ? 'kk' : 'ru'],
        )
      }
      return json({ ok: true, trialMode: mode, trialEndsAt: endsAt, trialDays: days })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('checkout error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
