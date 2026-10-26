import { json, optionsResponse } from '../_shared/http.ts'
import {
  CHECKOUT_COLUMNS,
  resolveUser,
  serviceClient,
  unauthorized,
} from '../_shared/session.ts'
import { latestSubmissionForPurchase } from '../_shared/purchase.ts'
import { accessPeriodFor, PERIOD_PRODUCT_COLUMNS, type PeriodProduct } from '../_shared/accessPeriod.ts'
import {
  isSubscriptionProduct,
  purchaseAccessOpen,
  subscriptionGrantsAccess,
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
      const status = body.status || 'completed'
      const { data, error } = await supabase
        .from('simple_purchases')
        .select('id, product_id, status, amount, created_at, confirmed_at, can_choose_teacher, assigned_teacher_id, access_expires_at, is_trial, trial_ends_at')
        .eq('buyer_profile_id', user.userId)
        .eq('status', status)
      if (error) return json({ error: error.message }, 500)
      type Row = { id: string; product_id: string; amount: number; created_at: string; access_expires_at?: string | null }
      const all = (data ?? []) as Row[]
      if (!all.length) return json({ purchases: [] })

      const productIds = [...new Set(all.map((p) => p.product_id))]
      const { data: products } = await supabase
        .from('products')
        .select(`id, title, headline, telegram_link, group_link_label, category_id, ${PERIOD_PRODUCT_COLUMNS}`)
        .in('id', productIds)
      const { data: subCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', 'subscriptions')
        .maybeSingle()
      type ProductRow = PeriodProduct & {
        id: string
        title: string
        headline: string | null
        telegram_link: string | null
        group_link_label: string | null
        category_id: string | null
      }
      const productById = new Map(((products ?? []) as ProductRow[]).map((p) => [p.id, p]))
      const periodOf = (row: Row) => {
        const product = productById.get(row.product_id)
        if (!product || product.category_id === subCategory?.id) return null
        return accessPeriodFor(product, row.amount)
      }

      // Access the seller ended is no longer "mine" on the buyer's side.
      const open = status === 'completed' ? all.filter((p) => purchaseAccessOpen(p)) : all
      const rows: Array<Row & { has_access: boolean }> = open.map((p) => ({ ...p, has_access: true }))

      // «Покупки» also lists a period product whose paid time ran out, so it can be paid again.
      if (status === 'completed' && body.includeRenewable === true) {
        const openProducts = new Set(open.map((p) => p.product_id))
        const latestExpired = new Map<string, Row>()
        for (const p of all) {
          if (openProducts.has(p.product_id) || !periodOf(p)) continue
          const prev = latestExpired.get(p.product_id)
          if (!prev || new Date(p.created_at) > new Date(prev.created_at)) latestExpired.set(p.product_id, p)
        }
        for (const p of latestExpired.values()) rows.push({ ...p, has_access: false })
      }

      return json({
        purchases: rows.map((purchase) => {
          const product = productById.get(purchase.product_id)
          const period = status === 'completed' ? periodOf(purchase) : null
          return {
            ...purchase,
            period_days: period?.days ?? null,
            period_interval: period?.interval ?? null,
            product: product
              ? {
                  id: product.id,
                  title: product.title,
                  headline: product.headline,
                  telegram_link: product.telegram_link,
                  group_link_label: product.group_link_label,
                }
              : null,
          }
        }),
      })
    }

    if (action === 'get_my_purchase') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)
      // A subscription gets a new purchase row for every paid period, so take the newest one.
      let { data } = await supabase
        .from('simple_purchases')
        .select('*')
        .eq('buyer_profile_id', user.userId)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!data) {
        const fallback = await supabase
          .from('simple_purchases')
          .select('*')
          .eq('simple_user_id', user.userId)
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(1)
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
        .select('id, price, is_active, is_paused')
        .eq('id', productId)
        .maybeSingle()
      if (!product || !product.is_active || product.is_paused) {
        return json({ error: 'Product unavailable' }, 400)
      }

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
        const { data: latest } = await supabase
          .from('simple_purchases')
          .select('id, status, amount')
          .eq('buyer_profile_id', user.userId)
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(1)
        const existing = latest?.[0]
        if (existing) {
          // Paying the next period of a period product starts a new purchase; anything else
          // returns the purchase the buyer already has.
          let renewing = false
          if (body.renew === true && existing.status === 'completed') {
            const { data: periodProduct } = await supabase
              .from('products')
              .select(PERIOD_PRODUCT_COLUMNS)
              .eq('id', productId)
              .maybeSingle()
            renewing = Boolean(periodProduct && accessPeriodFor(periodProduct as PeriodProduct, existing.amount))
          }
          if (!renewing) return json({ purchase: { id: existing.id, status: existing.status } })
        }
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

    if (action === 'check_trial') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)

      const { data: product } = await supabase
        .from('products')
        .select('id, has_free_trial, trial_days')
        .eq('id', productId)
        .maybeSingle()

      if (!product || !product.has_free_trial || !product.trial_days) {
        return json({ hasFreeTrial: false, hasUsedTrial: false, canUseTrial: false, trialDays: null })
      }

      const { data: trial } = await supabase
        .from('product_trials')
        .select('id, starts_at, ends_at')
        .eq('product_id', productId)
        .eq('buyer_profile_id', user.userId)
        .maybeSingle()

      const hasUsedTrial = Boolean(trial)
      return json({
        hasFreeTrial: true,
        hasUsedTrial,
        canUseTrial: !hasUsedTrial,
        trialDays: product.trial_days,
        trialEndsAt: trial?.ends_at ?? null,
      })
    }

    if (action === 'activate_trial') {
      const productId = String(body.productId || '').trim()
      if (!productId) return json({ error: 'Missing productId' }, 400)

      const { data: product } = await supabase
        .from('products')
        .select('id, has_free_trial, trial_days, is_active, is_paused')
        .eq('id', productId)
        .maybeSingle()

      if (!product || !product.is_active || product.is_paused) {
        return json({ error: 'Product unavailable' }, 400)
      }

      if (!product.has_free_trial || !product.trial_days || product.trial_days <= 0) {
        return json({ error: 'Free trial not available for this product' }, 400)
      }

      // Check if user already used trial
      const { data: existingTrial } = await supabase
        .from('product_trials')
        .select('id')
        .eq('product_id', productId)
        .eq('buyer_profile_id', user.userId)
        .maybeSingle()

      if (existingTrial) {
        return json({ error: 'trial_already_used', message: 'Пробный период уже был использован' }, 400)
      }

      const trialDays = Number(product.trial_days)
      const now = new Date()
      const endsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

      // 1. Record trial in product_trials (enforces uniqueness)
      const { error: trialError } = await supabase
        .from('product_trials')
        .insert({
          product_id: productId,
          buyer_profile_id: user.userId,
          trial_days: trialDays,
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
        })

      if (trialError) {
        return json({ error: 'trial_already_used', message: 'Пробный период уже был использован' }, 400)
      }

      // 2. Grant access in simple_purchases
      const { data: existingPurchase } = await supabase
        .from('simple_purchases')
        .select('id')
        .eq('buyer_profile_id', user.userId)
        .eq('product_id', productId)
        .maybeSingle()

      if (existingPurchase) {
        await supabase
          .from('simple_purchases')
          .update({
            status: 'completed',
            amount: 0,
            is_trial: true,
            trial_ends_at: endsAt.toISOString(),
            confirmed_at: now.toISOString(),
          })
          .eq('id', existingPurchase.id)
      } else {
        await supabase
          .from('simple_purchases')
          .insert({
            buyer_profile_id: user.userId,
            product_id: productId,
            amount: 0,
            status: 'completed',
            is_trial: true,
            trial_ends_at: endsAt.toISOString(),
            confirmed_at: now.toISOString(),
          })
      }

      return json({ ok: true, trialEndsAt: endsAt.toISOString(), trialDays })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('checkout error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
