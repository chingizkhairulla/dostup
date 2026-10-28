import { json, optionsResponse } from '../_shared/http.ts'
import {
  CHECKOUT_COLUMNS,
  CREATOR_PRODUCT_COLUMNS,
  creatorOwnsProduct,
  creatorProductIds,
  resolveCaller,
  resolveUser,
  serviceClient,
  unauthorized,
  forbidden,
} from '../_shared/session.ts'
import { latestSubmissionsForPurchases, recordVerificationEvent } from '../_shared/purchase.ts'
import { subscriptionGrantsAccess } from '../_shared/subscription.ts'
import { normalizeGroupLink } from '../_shared/groupLink.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const supabase = serviceClient()
    const caller = await resolveCaller(supabase, body)
    if (!caller) return unauthorized()

    const requireCreator = () => {
      if (caller.kind !== 'creator') return forbidden()
      return null
    }

    if (action === 'list') {
      if (caller.kind === 'creator') {
        const { data, error } = await supabase
          .from('products')
          .select(CREATOR_PRODUCT_COLUMNS)
          .eq('creator_account_id', caller.accountId)
          .order('created_at', { ascending: false })
        if (error) return json({ error: error.message }, 500)
        return json({ products: data ?? [] })
      }
      if (caller.role === 'teacher') {
        const { data: rows } = await supabase
          .from('product_teachers')
          .select('*, product:products(*)')
          .ilike('teacher_name', caller.name)
        return json({ products: (rows ?? []).map((r: { product: unknown }) => r.product).filter(Boolean) })
      }
      return forbidden()
    }

    if (action === 'get') {
      const id = String(body.id || body.productId || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      if (caller.kind === 'creator' && !(await creatorOwnsProduct(supabase, caller.accountId, id))) return forbidden()
      const { data } = await supabase.from('products').select(caller.kind === 'creator' ? CREATOR_PRODUCT_COLUMNS : CHECKOUT_COLUMNS).eq('id', id).maybeSingle()
      if (!data) return json({ error: 'Not found' }, 404)
      return json({ product: data })
    }

    if (action === 'create') {
      const denied = requireCreator()
      if (denied) return denied
      const product = body.product && typeof body.product === 'object' ? body.product as Record<string, unknown> : null
      if (!product?.title) return json({ error: 'Missing title' }, 400)
      if (product.after_access_enabled !== undefined && typeof product.after_access_enabled !== 'boolean') return json({ error: 'Bad after_access_enabled' }, 400)
      if (!product.category_id || !product.subcategory_id) {
        return json({ error: 'Missing category' }, 400)
      }
      const groupUrl = normalizeGroupLink(product.after_access_url)
      if (product.after_access_enabled && !groupUrl) return json({ error: 'Добавьте корректную https:// ссылку на группу' }, 400)
      const { data, error } = await supabase
        .from('products')
        .insert({
          title: product.title,
          headline: product.headline || null,
          description: product.description || null,
          price: product.price || 0,
          kaspi_link: product.kaspi_link || null,
          telegram_link: product.telegram_link || null,
          after_access_enabled: product.after_access_enabled === true,
          after_access_url: product.after_access_enabled ? groupUrl : null,
          has_schedule: product.has_schedule || false,
          is_active: product.is_active ?? true,
          // New products are always private; publishing is a separate, explicit step.
          is_published: false,
          image_url: product.image_url || null,
          video_url: product.video_url || null,
          media: Array.isArray(product.media) ? product.media : [],
          slug: product.slug || null,
          faq: product.faq ?? [],
          creator_id: caller.login,
          creator_account_id: caller.accountId,
          kaspi_phone: product.kaspi_phone ?? null,
          access_duration_days: product.access_duration_days ?? null,
          category_id: product.category_id,
          subcategory_id: product.subcategory_id,
          lesson_format: product.lesson_format ?? null,
          event_starts_at: product.event_starts_at ?? null,
          capacity: product.capacity ?? null,
          billing_period: product.billing_period ?? null,
          payment_type: product.payment_type ?? 'one_time',
          recurring_interval: product.recurring_interval ?? null,
          has_free_trial: product.has_free_trial ?? false,
          trial_days: product.trial_days ?? null,
          pricing_options: product.pricing_options ?? [],
          topic: product.topic ?? null,
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ product: data })
    }

    if (action === 'update') {
      const denied = requireCreator()
      if (denied) return denied
      const id = String(body.id || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates as Record<string, unknown> : null
      if (!id || !updates) return json({ error: 'Bad input' }, 400)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, id))) return forbidden()
      delete updates.id
      delete updates.creator_account_id
      delete updates.creator_id
      if ('after_access_enabled' in updates || 'after_access_url' in updates) {
        const { data: existing } = await supabase.from('products').select('after_access_enabled, after_access_url').eq('id', id).single()
        const enabled = updates.after_access_enabled ?? existing?.after_access_enabled ?? false
        if (typeof enabled !== 'boolean') return json({ error: 'Bad after_access_enabled' }, 400)
        const url = normalizeGroupLink(updates.after_access_url ?? existing?.after_access_url)
        if (enabled && !url) return json({ error: 'Добавьте корректную https:// ссылку на группу' }, 400)
        updates.after_access_enabled = enabled
        updates.after_access_url = enabled ? url : null
      }
      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ product: data })
    }

    if (action === 'delete') {
      const denied = requireCreator()
      if (denied) return denied
      const id = String(body.id || body.productId || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, id))) return forbidden()
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'list_teachers') {
      const productId = String(body.productId || '')
      if (!productId) return json({ error: 'Missing productId' }, 400)
      if (caller.kind === 'creator' && !(await creatorOwnsProduct(supabase, caller.accountId, productId))) {
        return forbidden()
      }
      const { data, error } = await supabase
        .from('product_teachers')
        .select('*')
        .eq('product_id', productId)
        .order('created_at')
      if (error) return json({ error: error.message }, 500)
      return json({ teachers: data ?? [] })
    }

    if (action === 'list_creator_teachers') {
      const denied = requireCreator()
      if (denied) return denied
      const ids = await creatorProductIds(supabase, caller.accountId)
      if (!ids.length) return json({ teachers: [] })
      const { data, error } = await supabase
        .from('product_teachers')
        .select('*, product:products(title)')
        .in('product_id', ids)
        .order('created_at')
      if (error) return json({ error: error.message }, 500)
      return json({ teachers: data ?? [] })
    }

    if (action === 'add_teacher') {
      const denied = requireCreator()
      if (denied) return denied
      const productId = String(body.productId || '')
      const teacherName = String(body.teacherName || '').trim()
      if (!productId || !teacherName) return json({ error: 'Bad input' }, 400)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, productId))) return forbidden()
      const { data, error } = await supabase
        .from('product_teachers')
        .insert({ product_id: productId, teacher_name: teacherName })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') return json({ error: 'Этот учитель уже добавлен к продукту' }, 400)
        return json({ error: error.message }, 500)
      }
      return json({ teacher: data })
    }

    if (action === 'remove_teacher') {
      const denied = requireCreator()
      if (denied) return denied
      const teacherId = String(body.teacherId || '')
      if (!teacherId) return json({ error: 'Missing teacherId' }, 400)
      const { data: row } = await supabase.from('product_teachers').select('product_id').eq('id', teacherId).maybeSingle()
      if (!row) return json({ error: 'Not found' }, 404)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, row.product_id))) return forbidden()
      const { error } = await supabase.from('product_teachers').delete().eq('id', teacherId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'list_purchases') {
      const denied = requireCreator()
      if (denied) return denied
      const ids = await creatorProductIds(supabase, caller.accountId)
      if (!ids.length) return json({ purchases: [] })
      const { data, error } = await supabase
        .from('simple_purchases')
        .select('*')
        .in('product_id', ids)
        .order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      const simpleIds = [...new Set((data ?? []).map((p: { simple_user_id?: string | null }) => p.simple_user_id).filter(Boolean))] as string[]
      const profileIds = [...new Set((data ?? []).map((p: { buyer_profile_id?: string | null }) => p.buyer_profile_id).filter(Boolean))] as string[]
      const { data: users } = simpleIds.length
        ? await supabase.from('simple_users').select('id, name, phone').in('id', simpleIds)
        : { data: [] as { id: string; name: string; phone: string | null }[] }
      let profiles: { id: string; display_name: string | null }[] = []
      if (profileIds.length) {
        const profileRes = await supabase.from('profiles').select('id, display_name').in('id', profileIds)
        if (!profileRes.error) profiles = profileRes.data ?? []
      }
      const userMap = new Map((users ?? []).map((u) => [u.id, u]))
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
      const submissions = await latestSubmissionsForPurchases(
        supabase,
        (data ?? []).map((p: { id: string }) => p.id),
      )
      // Every receipt of a purchase (renewals add more), newest first, for the buyer card.
      const receiptsByPurchase = new Map<string, unknown[]>()
      const purchaseIds = (data ?? []).map((p: { id: string }) => p.id)
      if (purchaseIds.length) {
        const { data: receipts } = await supabase
          .from('payment_submissions')
          .select('id, purchase_id, verification_status, detected_amount, detected_currency, receipt_mime_type, created_at')
          .in('purchase_id', purchaseIds)
          .order('created_at', { ascending: false })
        for (const r of (receipts ?? []) as { purchase_id: string }[]) {
          const list = receiptsByPurchase.get(r.purchase_id) ?? []
          list.push(r)
          receiptsByPurchase.set(r.purchase_id, list)
        }
      }
      const subscriptionByKey = new Map<string, unknown>()
      if (profileIds.length) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('id, product_id, buyer_profile_id, billing_period, current_period_start, current_period_end, status')
          .in('product_id', ids)
          .in('buyer_profile_id', profileIds)
        for (const sub of (subs ?? []) as { product_id: string; buyer_profile_id: string }[]) {
          subscriptionByKey.set(`${sub.product_id}:${sub.buyer_profile_id}`, sub)
        }
      }
      return json({
        purchases: (data ?? []).map((p: {
          id: string
          simple_user_id?: string | null
          buyer_profile_id?: string | null
        }) => {
          const simple = p.simple_user_id ? userMap.get(p.simple_user_id) : null
          const profile = p.buyer_profile_id ? profileMap.get(p.buyer_profile_id) : null
          return {
            ...p,
            user: simple || (profile
              ? { id: profile.id, name: profile.display_name || 'Buyer', phone: '' }
              : null),
            latest_submission: submissions.get(p.id) || null,
            receipts: receiptsByPurchase.get(p.id) ?? [],
            subscription: p.buyer_profile_id
              ? subscriptionByKey.get(`${(p as { product_id?: string }).product_id}:${p.buyer_profile_id}`) ?? null
              : null,
          }
        }),
      })
    }

    if (action === 'update_purchase') {
      const denied = requireCreator()
      if (denied) return denied
      const purchaseId = String(body.purchaseId || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates as Record<string, unknown> : null
      if (!purchaseId || !updates) return json({ error: 'Bad input' }, 400)
      const { data: purchase } = await supabase
        .from('simple_purchases')
        .select('id, product_id')
        .eq('id', purchaseId)
        .maybeSingle()
      if (!purchase) return json({ error: 'Not found' }, 404)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, purchase.product_id))) return forbidden()
      const allowed: Record<string, unknown> = {}
      if (typeof updates.status === 'string' && updates.status !== 'rejected') allowed.status = updates.status
      if ('assigned_teacher_id' in updates) allowed.assigned_teacher_id = updates.assigned_teacher_id
      if (typeof updates.can_choose_teacher === 'boolean') allowed.can_choose_teacher = updates.can_choose_teacher

      if (updates.status === 'rejected') {
        const actor = caller.kind === 'creator' ? `creator:${caller.login}` : 'creator'
        const { data: submission } = await supabase
          .from('payment_submissions')
          .select('id')
          .eq('purchase_id', purchaseId)
          .in('verification_status', ['manual_review', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (submission) {
          await supabase
            .from('payment_submissions')
            .update({
              verification_status: 'rejected',
              rejection_reason: 'creator_rejected',
              decided_at: new Date().toISOString(),
              decided_by: actor,
            })
            .eq('id', submission.id)
          await recordVerificationEvent(supabase, {
            submissionId: submission.id,
            purchaseId,
            actor,
            decision: 'rejected',
            checks: { source: 'creator_manual_review' },
            notes: 'creator_rejected',
          })
        } else {
          const { error } = await supabase
            .from('simple_purchases')
            .delete()
            .eq('id', purchaseId)
            .eq('status', 'pending')
          if (error) return json({ error: error.message }, 500)
        }
        return json({ ok: true })
      }

      if (!Object.keys(allowed).length) return json({ ok: true })
      const { error } = await supabase.from('simple_purchases').update(allowed).eq('id', purchaseId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'set_purchase_access') {
      const denied = requireCreator()
      if (denied) return denied
      const purchaseId = String(body.purchaseId || '')
      const mode = String(body.mode || '')
      if (!purchaseId || !['forever', 'until', 'revoke'].includes(mode)) return json({ error: 'Bad input' }, 400)
      const until = mode === 'until' ? new Date(String(body.until || '')) : null
      if (until && Number.isNaN(until.getTime())) return json({ error: 'Bad date' }, 400)

      const { data: purchase } = await supabase
        .from('simple_purchases')
        .select('id, product_id, buyer_profile_id, status, is_trial')
        .eq('id', purchaseId)
        .maybeSingle()
      if (!purchase) return json({ error: 'Not found' }, 404)
      if (!(await creatorOwnsProduct(supabase, caller.accountId, purchase.product_id))) return forbidden()
      if (!['completed', 'revoked'].includes(purchase.status)) return json({ error: 'Purchase is not paid' }, 400)

      if (mode === 'revoke') {
        const { error } = await supabase.from('simple_purchases').update({ status: 'revoked' }).eq('id', purchaseId)
        if (error) return json({ error: error.message }, 500)
        if (purchase.buyer_profile_id) {
          await supabase
            .from('subscriptions')
            .update({ status: 'cancelled', current_period_end: new Date().toISOString() })
            .eq('product_id', purchase.product_id)
            .eq('buyer_profile_id', purchase.buyer_profile_id)
        }
        return json({ ok: true })
      }

      // Opening access again also turns a trial into a normal purchase.
      const { error } = await supabase
        .from('simple_purchases')
        .update({
          status: 'completed',
          access_expires_at: until ? until.toISOString() : null,
          is_trial: false,
          trial_ends_at: null,
        })
        .eq('id', purchaseId)
      if (error) return json({ error: error.message }, 500)

      // Subscription products are gated by the subscription row; move its period to match.
      if (purchase.buyer_profile_id) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('product_id', purchase.product_id)
          .eq('buyer_profile_id', purchase.buyer_profile_id)
          .maybeSingle()
        if (sub) {
          // "Forever" on a subscription: a period end far enough away that it never lapses.
          const periodEnd = until ? until.toISOString() : '2999-12-31T00:00:00.000Z'
          await supabase
            .from('subscriptions')
            .update({ status: 'active', current_period_end: periodEnd, renewal_reminder_sent_at: null })
            .eq('id', sub.id)
        }
      }
      return json({ ok: true })
    }

    if (action === 'list_subscriptions') {
      const denied = requireCreator()
      if (denied) return denied
      const ids = await creatorProductIds(supabase, caller.accountId)
      if (!ids.length) return json({ subscriptions: [], counts: {} })

      const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')
        .in('product_id', ids)
        .order('current_period_end', { ascending: true })
      if (error) return json({ error: error.message }, 500)

      const profileIds = [...new Set((subs ?? []).map((s: { buyer_profile_id: string }) => s.buyer_profile_id))]
      const productIds = [...new Set((subs ?? []).map((s: { product_id: string }) => s.product_id))]

      const { data: profiles } = profileIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', profileIds)
        : { data: [] as { id: string; display_name: string | null }[] }
      const { data: products } = productIds.length
        ? await supabase.from('products').select('id, title, billing_period').in('id', productIds)
        : { data: [] as { id: string; title: string; billing_period: string | null }[] }

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
      const productMap = new Map((products ?? []).map((p) => [p.id, p]))
      const counts: Record<string, number> = {}

      const rows = (subs ?? []).map((sub: {
        id: string
        product_id: string
        buyer_profile_id: string
        status: string
        current_period_end: string
        billing_period: string
        price: number
      }) => {
        if (subscriptionGrantsAccess(sub as { status: string; current_period_end: string })) {
          counts[sub.product_id] = (counts[sub.product_id] ?? 0) + 1
        }
        const profile = profileMap.get(sub.buyer_profile_id)
        const product = productMap.get(sub.product_id)
        return {
          ...sub,
          buyer_name: profile?.display_name || 'Buyer',
          product_title: product?.title || '',
        }
      })

      return json({ subscriptions: rows, counts })
    }

    if (action === 'list_users_by_ids') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
      if (!ids.length) return json({ users: [] })
      if (caller.kind === 'user' && caller.role !== 'teacher') {
        const self = await resolveUser(supabase, String(body.sessionToken || ''))
        if (!self) return unauthorized()
      }
      const { data } = await supabase.from('simple_users').select('id, name, phone').in('id', ids)
      return json({ users: data ?? [] })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-products error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
