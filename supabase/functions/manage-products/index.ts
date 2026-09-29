import { json, optionsResponse } from '../_shared/http.ts'
import {
  CHECKOUT_COLUMNS,
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
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'

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
          .select(CHECKOUT_COLUMNS)
          .eq('creator_account_id', caller.accountId)
          .order('created_at', { ascending: false })
        if (error) return json({ error: error.message }, 500)

        const productIds = (data ?? []).map((p: { id: string }) => p.id)
        const ppmMap: Record<string, any[]> = {}
        if (productIds.length > 0) {
          const { data: ppmData } = await supabase
            .from('product_payment_methods')
            .select('product_id, payment_methods(*)')
            .in('product_id', productIds)
          if (ppmData) {
            for (const row of ppmData) {
              if (!ppmMap[row.product_id]) ppmMap[row.product_id] = []
              if (row.payment_methods) {
                ppmMap[row.product_id].push(row.payment_methods)
              }
            }
          }
        }

        const enriched = (data ?? []).map((p: { id: string }) => {
          const rawPms = ppmMap[p.id] || []
          const pms = rawPms
            .filter(Boolean)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          return {
            ...p,
            payment_methods: pms,
            payment_method_ids: pms.map((m: any) => m.id),
          }
        })
        return json({ products: enriched })
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
      const { data } = await supabase.from('products').select(CHECKOUT_COLUMNS).eq('id', id).maybeSingle()
      if (!data) return json({ error: 'Not found' }, 404)
      if (caller.kind === 'creator' && data.creator_account_id !== caller.accountId) return forbidden()

      const { data: ppmData } = await supabase
        .from('product_payment_methods')
        .select('payment_methods(*)')
        .eq('product_id', data.id)
      const pms = (ppmData ?? [])
        .map((r: any) => r.payment_methods)
        .filter(Boolean)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

      return json({
        product: {
          ...data,
          payment_methods: pms,
          payment_method_ids: pms.map((m: any) => m.id),
        },
      })
    }

    if (action === 'create') {
      const denied = requireCreator()
      if (denied) return denied
      const product = body.product && typeof body.product === 'object' ? body.product as Record<string, unknown> : null
      if (!product?.title) return json({ error: 'Missing title' }, 400)
      if (!product.category_id || !product.subcategory_id) {
        return json({ error: 'Missing category' }, 400)
      }
      const { data, error } = await supabase
        .from('products')
        .insert({
          title: product.title,
          headline: product.headline || null,
          description: product.description || null,
          price: product.price || 0,
          telegram_link: product.telegram_link || null,
          has_schedule: product.has_schedule || false,
          is_active: product.is_active ?? true,
          image_url: product.image_url || null,
          video_url: product.video_url || null,
          media: Array.isArray(product.media) ? product.media : [],
          slug: product.slug || null,
          faq: product.faq ?? [],
          creator_id: caller.login,
          creator_account_id: caller.accountId,
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

      const rawPmIds = Array.isArray(product.payment_method_ids)
        ? (product.payment_method_ids as string[])
        : Array.isArray(body.payment_method_ids)
        ? (body.payment_method_ids as string[])
        : []
      const pmIds = rawPmIds.filter((x): x is string => typeof x === 'string' && !!x.trim())

      let pms: any[] = []
      if (pmIds.length > 0) {
        await supabase
          .from('product_payment_methods')
          .insert(pmIds.map((pmId: string) => ({ product_id: data.id, payment_method_id: pmId })))
        const { data: createdPms } = await supabase
          .from('payment_methods')
          .select('*')
          .in('id', pmIds)
        pms = (createdPms ?? [])
          .filter(Boolean)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      }

      return json({ product: { ...data, payment_methods: pms, payment_method_ids: pmIds } })
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
      delete updates.kaspi_link
      delete updates.kaspi_phone

      const rawPmIds = Array.isArray(updates.payment_method_ids)
        ? (updates.payment_method_ids as string[])
        : Array.isArray(body.payment_method_ids)
        ? (body.payment_method_ids as string[])
        : null
      delete updates.payment_method_ids
      delete updates.payment_methods

      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)

      let pms: any[] = []
      let finalPmIds: string[] = []
      if (rawPmIds !== null) {
        finalPmIds = rawPmIds.filter((x): x is string => typeof x === 'string' && !!x.trim())
        await supabase.from('product_payment_methods').delete().eq('product_id', id)
        if (finalPmIds.length > 0) {
          await supabase
            .from('product_payment_methods')
            .insert(finalPmIds.map((pmId: string) => ({ product_id: id, payment_method_id: pmId })))
          const { data: updatedPms } = await supabase
            .from('payment_methods')
            .select('*')
            .in('id', finalPmIds)
          pms = (updatedPms ?? [])
            .filter(Boolean)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        }
      } else {
        const { data: ppmData } = await supabase
          .from('product_payment_methods')
          .select('payment_methods(*)')
          .eq('product_id', id)
        pms = (ppmData ?? [])
          .map((r: any) => r.payment_methods)
          .filter(Boolean)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        finalPmIds = pms.map((m: any) => m.id)
      }

      return json({ product: { ...data, payment_methods: pms, payment_method_ids: finalPmIds } })
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

    if (action === 'list_payment_methods') {
      const denied = requireCreator()
      if (denied) return denied
      const { data: ca } = await supabase
        .from('creator_accounts')
        .select('profile_id')
        .eq('id', caller.accountId)
        .maybeSingle()
      let profId = ca?.profile_id
      if (!profId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id')
          .in('type', ['creator', 'school'])
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        profId = p?.id || null
      }
      if (!profId) return json({ payment_methods: [] })

      const { data: methods, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('profile_id', profId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      return json({ payment_methods: methods ?? [] })
    }

    if (action === 'create_payment_method') {
      const denied = requireCreator()
      if (denied) return denied
      const { data: ca } = await supabase
        .from('creator_accounts')
        .select('profile_id')
        .eq('id', caller.accountId)
        .maybeSingle()
      let profId = ca?.profile_id
      if (!profId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id')
          .in('type', ['creator', 'school'])
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        profId = p?.id || null
      }
      if (!profId) return json({ error: 'Profile not found' }, 404)

      const type = String(body.type || '').trim()
      if (!['link', 'phone', 'card'].includes(type)) {
        return json({ error: 'Неверный тип способа оплаты' }, 400)
      }

      let bank: string | null = null
      let bankName: string | null = null
      let recipientName: string | null = null
      const value = String(body.value || '').trim()

      if (!value) {
        return json({ error: 'Заполните поле реквизитов' }, 400)
      }

      if (type === 'link') {
        bank = null
        bankName = null
        recipientName = null
      } else {
        bank = String(body.bank || 'kaspi').trim()
        if (!['kaspi', 'halyk', 'freedom', 'other'].includes(bank)) {
          return json({ error: 'Неверный банк' }, 400)
        }
        if (bank === 'other') {
          bankName = String(body.bank_name || body.bankName || '').trim()
          if (!bankName) return json({ error: 'Укажите название банка' }, 400)
        }
        recipientName = String(body.recipient_name || body.recipientName || '').trim()
        if (!recipientName) return json({ error: 'Укажите имя получателя' }, 400)
      }

      const { data: maxRow } = await supabase
        .from('payment_methods')
        .select('sort_order')
        .eq('profile_id', profId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sortOrder = (maxRow?.sort_order ?? -1) + 1

      const { data: pm, error } = await supabase
        .from('payment_methods')
        .insert({
          profile_id: profId,
          type,
          bank,
          bank_name: bankName,
          value,
          recipient_name: recipientName,
          sort_order: sortOrder,
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ payment_method: pm })
    }

    if (action === 'delete_payment_method') {
      const denied = requireCreator()
      if (denied) return denied
      const id = String(body.id || body.paymentMethodId || '')
      if (!id) return json({ error: 'Missing id' }, 400)

      const { data: ca } = await supabase
        .from('creator_accounts')
        .select('profile_id')
        .eq('id', caller.accountId)
        .maybeSingle()
      if (!ca?.profile_id) return json({ error: 'Profile not found' }, 404)

      const { data: pm } = await supabase
        .from('payment_methods')
        .select('profile_id')
        .eq('id', id)
        .maybeSingle()
      if (!pm || pm.profile_id !== ca.profile_id) return forbidden()

      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
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
      const pmIds = [...new Set((data ?? []).map((p: any) => p.payment_method_id).filter(Boolean))] as string[]
      const { data: pmList } = pmIds.length
        ? await supabase.from('payment_methods').select('id, type, bank, bank_name, value, recipient_name').in('id', pmIds)
        : { data: [] }
      const pmMap = new Map((pmList ?? []).map((pm: any) => [pm.id, pm]))

      return json({
        purchases: (data ?? []).map((p: {
          id: string
          simple_user_id?: string | null
          buyer_profile_id?: string | null
          payment_method_id?: string | null
        }) => {
          const simple = p.simple_user_id ? userMap.get(p.simple_user_id) : null
          const profile = p.buyer_profile_id ? profileMap.get(p.buyer_profile_id) : null
          return {
            ...p,
            user: simple || (profile
              ? { id: profile.id, name: profile.display_name || 'Buyer', phone: '' }
              : null),
            latest_submission: submissions.get(p.id) || null,
            payment_method: p.payment_method_id ? pmMap.get(p.payment_method_id) || null : null,
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
        .select('id, product_id, buyer_profile_id, simple_user_id')
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

        // 1. Set purchase status to rejected
        const { error: rejectError } = await supabase
          .from('simple_purchases')
          .update({ status: 'rejected' })
          .eq('id', purchaseId)

        if (rejectError) {
          console.error('Error rejecting purchase:', rejectError)
          return json({ error: rejectError.message }, 500)
        }

        // 2. Reject submission
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
        }

        // 3. Notify buyer: push & email
        try {
          const buyerId = purchase.buyer_profile_id || purchase.simple_user_id
          const notifTitle = 'Оплата не подтверждена'
          const notifBody = 'Продавец не нашёл ваш платёж. Проверьте перевод или прикрепите другой чек.'

          // Push
          try {
            await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: buyerId,
                targetRole: 'student',
                title: notifTitle,
                body: notifBody,
                data: {
                  type: 'payment_rejected',
                  purchaseId,
                  productId: purchase.product_id,
                },
              },
            })
          } catch (pushErr) {
            console.error('Failed to send rejection push to buyer:', pushErr)
          }

          // Email
          let buyerEmail: string | null = null
          if (purchase.buyer_profile_id) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('auth_user_id')
              .eq('id', purchase.buyer_profile_id)
              .maybeSingle()
            if (prof?.auth_user_id) {
              const { data: authUser } = await supabase.auth.admin.getUserById(prof.auth_user_id)
              if (authUser?.user?.email) buyerEmail = authUser.user.email
            }
          }

          if (buyerEmail) {
            try {
              const { data: prod } = await supabase
                .from('products')
                .select('id, title, slug')
                .eq('id', purchase.product_id)
                .maybeSingle()
              const checkoutUrl = `${appBaseUrl()}/checkout/${purchase.product_id}`

              await sendTransactionalEmail({
                to: buyerEmail,
                subject: notifTitle,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
                    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #DC2626;">${notifTitle}</h2>
                    <p style="font-size: 15px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
                      ${notifBody}
                    </p>
                    <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0;">
                      <p style="margin: 4px 0; font-size: 14px;"><strong>Продукт:</strong> ${prod?.title || 'Курс/Материал'}</p>
                    </div>
                    <div style="margin: 24px 0;">
                      <a href="${checkoutUrl}" style="display: inline-block; background: #FF6B00; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                        Прикрепить другой чек
                      </a>
                    </div>
                  </div>
                `,
              })
            } catch (mailErr) {
              console.error('Failed to send rejection email to buyer:', mailErr)
            }
          }
        } catch (buyerErr) {
          console.error('Error notifying buyer on rejection:', buyerErr)
        }

        return json({ ok: true, status: 'rejected' })
      }

      if (!Object.keys(allowed).length) return json({ ok: true })
      const { error } = await supabase.from('simple_purchases').update(allowed).eq('id', purchaseId)
      if (error) return json({ error: error.message }, 500)
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
