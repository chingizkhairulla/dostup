import { json, optionsResponse } from '../_shared/http.ts'
import {
  assertCanManageProduct,
  creatorOwnsProduct,
  creatorProductIds,
  resolveCaller,
  serviceClient,
  unauthorized,
  forbidden,
} from '../_shared/session.ts'
import { buyerAccessibleProductIds, buyerHasProductAccess } from '../_shared/subscription.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const supabase = serviceClient()
    const caller = await resolveCaller(supabase, body)
    if (!caller) return unauthorized()

    const canReadProduct = async (productId: string) => {
      if (await assertCanManageProduct(supabase, caller, productId)) return true
      if (caller.kind === 'user') return buyerHasProductAccess(supabase, caller.userId, productId)
      return false
    }

    if (action === 'list') {
      const productId = String(body.productId || '')
      if (!productId) return json({ materials: [] })
      if (!(await canReadProduct(productId))) return forbidden()
      let q = supabase.from('materials').select('*').eq('product_id', productId)
      if (body.includeDeleted) {
        q = q.not('deleted_at', 'is', null)
      } else {
        q = q.is('deleted_at', null)
      }
      if (body.creatorOnly) q = q.is('teacher_id', null)
      if (body.teacherId) q = q.eq('teacher_id', body.teacherId)
      const { data, error } = await q.order('order_index', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      return json({ materials: data ?? [] })
    }

    if (action === 'list_student') {
      if (caller.kind !== 'user') return forbidden()
      const productIds = await buyerAccessibleProductIds(supabase, caller.userId)
      if (!productIds.length) return json({ materials: [], purchases: [] })

      const { data: purchases } = await supabase
        .from('simple_purchases')
        .select('product_id, assigned_teacher_id, can_choose_teacher')
        .eq('buyer_profile_id', caller.userId)
        .eq('status', 'completed')
        .in('product_id', productIds)
      const purchasesList = purchases ?? []
      const { data: creatorMaterials } = await supabase
        .from('materials')
        .select('*')
        .in('product_id', productIds)
        .is('teacher_id', null)
        .is('deleted_at', null)
        .order('order_index')
      const canChoose = purchasesList.filter((p: { can_choose_teacher: boolean | null }) => p.can_choose_teacher).map((p: { product_id: string }) => p.product_id)
      const specific = purchasesList.filter((p: { can_choose_teacher: boolean | null; assigned_teacher_id: string | null }) => !p.can_choose_teacher && p.assigned_teacher_id)
      let teacherMaterials: unknown[] = []
      if (canChoose.length) {
        const { data } = await supabase
          .from('materials')
          .select('*')
          .in('product_id', canChoose)
          .not('teacher_id', 'is', null)
          .is('deleted_at', null)
        teacherMaterials = data ?? []
      }
      for (const p of specific) {
        const { data } = await supabase
          .from('materials')
          .select('*')
          .eq('product_id', p.product_id)
          .eq('teacher_id', p.assigned_teacher_id)
          .is('deleted_at', null)
        teacherMaterials = teacherMaterials.concat(data ?? [])
      }
      return json({ materials: [...(creatorMaterials ?? []), ...teacherMaterials], purchases: purchasesList })
    }

    if (action === 'list_all_creator') {
      if (caller.kind !== 'creator') return forbidden()
      const ids = await creatorProductIds(supabase, caller.accountId)
      if (!ids.length) return json({ materials: [], products: [] })
      const { data: products } = await supabase.from('products').select('id, title').in('id', ids)
      const { data, error } = await supabase
        .from('materials')
        .select('id, product_id, title, type, file_url, file_size, created_at, parent_id')
        .in('product_id', ids)
        .in('type', ['file', 'folder', 'link'])
        .is('teacher_id', null)
        .is('deleted_at', null)
      if (error) return json({ error: error.message }, 500)
      const titleMap = new Map((products ?? []).map((p: { id: string; title: string }) => [p.id, p.title]))
      return json({
        materials: (data ?? []).map((m: { product_id: string }) => ({
          ...m,
          product_title: titleMap.get(m.product_id) ?? '',
        })),
        products: products ?? [],
      })
    }

    if (action === 'create') {
      const material = body.material && typeof body.material === 'object' ? body.material as Record<string, unknown> : null
      if (!material?.product_id || !material.title) return json({ error: 'Bad input' }, 400)
      const productId = String(material.product_id)
      if (!(await assertCanManageProduct(supabase, caller, productId))) return forbidden()
      const row: Record<string, unknown> = {
        product_id: productId,
        title: material.title,
        type: material.type || 'file',
        content: material.content || null,
        file_url: material.file_url || null,
        order_index: material.order_index || 0,
        parent_id: material.parent_id || null,
        allow_view: material.allow_view !== false,
        allow_download: material.allow_download !== false,
        available_at: material.available_at || null,
        teacher_allow_download: material.teacher_allow_download !== false,
        file_size: material.file_size ?? null,
      }
      if (caller.kind === 'user') row.teacher_id = caller.userId
      const { data, error } = await supabase.from('materials').insert(row).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ material: data })
    }

    if (action === 'update') {
      const id = String(body.id || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates as Record<string, unknown> : {}
      if (!id) return json({ error: 'Missing id' }, 400)
      const { data: existing } = await supabase.from('materials').select('id, product_id, teacher_id').eq('id', id).maybeSingle()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (!(await assertCanManageProduct(supabase, caller, existing.product_id))) return forbidden()
      if (caller.kind === 'user' && existing.teacher_id !== caller.userId) return forbidden()
      delete updates.id
      delete updates.product_id
      delete updates.teacher_id
      const { data, error } = await supabase.from('materials').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ material: data })
    }

    if (action === 'soft_delete') {
      const id = String(body.id || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      const { data: cur } = await supabase.from('materials').select('parent_id, original_parent_id, product_id, teacher_id').eq('id', id).maybeSingle()
      if (!cur) return json({ error: 'Not found' }, 404)
      if (!(await assertCanManageProduct(supabase, caller, cur.product_id))) return forbidden()
      const snapshot = cur.original_parent_id ?? cur.parent_id ?? null
      const { error } = await supabase
        .from('materials')
        .update({ deleted_at: new Date().toISOString(), original_parent_id: snapshot, parent_id: null })
        .eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'restore') {
      const id = String(body.id || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      const { data: cur } = await supabase.from('materials').select('original_parent_id, product_id').eq('id', id).maybeSingle()
      if (!cur) return json({ error: 'Not found' }, 404)
      if (!(await assertCanManageProduct(supabase, caller, cur.product_id))) return forbidden()
      const orig = cur.original_parent_id ?? null
      let parent: string | null = null
      let restoredTo: 'original' | 'root' | 'custom' = 'root'
      if (body.targetParentId === undefined) {
        if (orig) {
          const { data: folder } = await supabase.from('materials').select('id, deleted_at').eq('id', orig).maybeSingle()
          if (folder && !folder.deleted_at) {
            parent = orig
            restoredTo = 'original'
          }
        }
      } else if (body.targetParentId) {
        parent = String(body.targetParentId)
        restoredTo = 'custom'
      }
      const { error } = await supabase
        .from('materials')
        .update({ deleted_at: null, parent_id: parent, original_parent_id: null })
        .eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ restoredTo, parentId: parent })
    }

    if (action === 'hard_delete') {
      const id = String(body.id || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      const { data: cur } = await supabase.from('materials').select('product_id, teacher_id, file_url').eq('id', id).maybeSingle()
      if (!cur) return json({ error: 'Not found' }, 404)
      if (!(await assertCanManageProduct(supabase, caller, cur.product_id))) return forbidden()
      if (caller.kind === 'user' && cur.teacher_id !== caller.userId) return forbidden()
      const { error } = await supabase.from('materials').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'empty_trash') {
      const productId = String(body.productId || '')
      if (!productId) return json({ error: 'Missing productId' }, 400)
      if (caller.kind !== 'creator' || !(await creatorOwnsProduct(supabase, caller.accountId, productId))) {
        return forbidden()
      }
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('product_id', productId)
        .is('teacher_id', null)
        .not('deleted_at', 'is', null)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'list_bookmarks') {
      const userType = caller.kind === 'creator' ? 'creator' : caller.role === 'teacher' ? 'teacher' : 'student'
      const userRef = caller.kind === 'creator' ? caller.login : caller.userId
      const { data, error } = await supabase
        .from('material_bookmarks')
        .select('*')
        .or(`and(user_type.eq.${userType},user_ref.eq.${userRef}),and(user_type.eq.creator,is_public.eq.true)`)
      if (error) return json({ error: error.message }, 500)
      return json({ bookmarks: data ?? [], viewer: { userType, userRef } })
    }

    if (action === 'toggle_bookmark') {
      const materialId = String(body.materialId || '')
      const existingId = typeof body.existingId === 'string' ? body.existingId : null
      const userType = caller.kind === 'creator' ? 'creator' : caller.role === 'teacher' ? 'teacher' : 'student'
      const userRef = caller.kind === 'creator' ? caller.login : caller.userId
      if (!materialId) return json({ error: 'Missing materialId' }, 400)
      if (existingId) {
        const { error } = await supabase
          .from('material_bookmarks')
          .delete()
          .eq('id', existingId)
          .eq('user_type', userType)
          .eq('user_ref', userRef)
        if (error) return json({ error: error.message }, 500)
        return json({ deleted: true })
      }
      const { error } = await supabase.from('material_bookmarks').insert({
        material_id: materialId,
        user_type: userType,
        user_ref: userRef,
        is_public: false,
      })
      if (error) return json({ error: error.message }, 500)
      return json({ deleted: false })
    }

    if (action === 'set_bookmark_public') {
      if (caller.kind !== 'creator') return forbidden()
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
      const id = typeof body.id === 'string' ? body.id : null
      const isPublic = !!body.isPublic
      const target = ids.length ? ids : id ? [id] : []
      if (!target.length) return json({ ok: true })
      const { error } = await supabase
        .from('material_bookmarks')
        .update({ is_public: isPublic })
        .in('id', target)
        .eq('user_type', 'creator')
        .eq('user_ref', caller.login)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'list_announcements') {
      const productIds = Array.isArray(body.productIds)
        ? body.productIds.filter((x: unknown) => typeof x === 'string')
        : body.productId
          ? [String(body.productId)]
          : []
      if (!productIds.length) return json({ announcements: [] })
      for (const pid of productIds) {
        if (!(await canReadProduct(pid))) return forbidden()
      }
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .in('product_id', productIds)
        .order('order_index', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      return json({ announcements: data ?? [] })
    }

    if (action === 'list_unlocks') {
      if (caller.kind !== 'user') return forbidden()
      const { data } = await supabase
        .from('material_unlocks')
        .select('*')
        .eq('simple_user_id', caller.userId)
      return json({ unlocks: data ?? [] })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-materials error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
