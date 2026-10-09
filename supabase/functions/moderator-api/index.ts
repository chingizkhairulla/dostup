import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSignedAttachmentUrls } from '../_shared/chatAttachments.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const PBKDF2_ITERATIONS = 100000
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, km, 256)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufToB64(salt.buffer)}$${bufToB64(bits)}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    const { action, token } = body as { action?: string; token?: string }
    if (!token || typeof token !== 'string') return json({ error: 'No token' }, 401)
    const { data: session } = await supabase.from('moderator_sessions').select('*').eq('token', token).maybeSingle()
    if (!session || new Date(session.expires_at) < new Date()) return json({ error: 'Invalid session' }, 401)

    if (action === 'validate') {
      return json({ success: true })
    }

    if (action === 'stats') {
      const [creators, purchases, products, users, teachers, pendingTopics, pendingReports] = await Promise.all([
        supabase.from('creator_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('simple_purchases').select('product_id, simple_user_id, amount, status').eq('status', 'completed'),
        supabase.from('products').select('id, creator_id, title, is_active'),
        supabase.from('simple_users').select('id, name, role'),
        supabase.from('product_teachers').select('id, product_id, teacher_name'),
        supabase.from('topics').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('product_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      const productById = new Map((products.data ?? []).map((p: any) => [p.id, p]))
      const perCreator: Record<string, { revenue: number; students: Set<string>; products: number; teachers: Set<string> }> = {}
      for (const p of products.data ?? []) {
        const c = (p as any).creator_id
        if (!perCreator[c]) perCreator[c] = { revenue: 0, students: new Set(), products: 0, teachers: new Set() }
        perCreator[c].products += 1
      }
      for (const t of teachers.data ?? []) {
        const prod = productById.get((t as any).product_id) as any
        if (!prod) continue
        const c = prod.creator_id
        if (!perCreator[c]) perCreator[c] = { revenue: 0, students: new Set(), products: 0, teachers: new Set() }
        if ((t as any).teacher_name?.trim()) perCreator[c].teachers.add((t as any).teacher_name.trim())
      }
      for (const pur of purchases.data ?? []) {
        const prod = productById.get((pur as any).product_id) as any
        if (!prod) continue
        const c = prod.creator_id
        if (!perCreator[c]) perCreator[c] = { revenue: 0, students: new Set(), products: 0, teachers: new Set() }
        perCreator[c].revenue += Number((pur as any).amount ?? 0)
        perCreator[c].students.add((pur as any).simple_user_id)
      }
      const list = (creators.data ?? []).map((c: any) => {
        const stats = perCreator[c.login] ?? perCreator[c.display_name] ?? { revenue: 0, students: new Set(), products: 0, teachers: new Set() }
        return {
          id: c.id,
          login: c.login,
          display_name: c.display_name,
          account_type: c.account_type,
          is_blocked: !!c.is_blocked,
          created_at: c.created_at,
          students_count: stats.students.size,
          revenue: stats.revenue,
          products_count: stats.products,
          teachers_count: stats.teachers.size,
        }
      })
      const courseCreators = list.filter((c: any) => c.account_type === 'course_creator' || c.account_type === 'creator')
      const onlineSchools = list.filter((c: any) => c.account_type === 'online_school' || c.account_type === 'school')

      const totals = {
        sellers: list.length,
        creators: list.length,
        students: (users.data ?? []).filter((u: any) => u.role === 'student' || !u.role).length,
        revenue: list.reduce((s, c) => s + c.revenue, 0),
        products: (products.data ?? []).length,
        teachers: (teachers.data ?? []).length,
        pending_topics: pendingTopics?.count ?? 0,
        pending_reports: pendingReports?.count ?? 0,
        course_creators: {
          count: courseCreators.length,
          revenue: courseCreators.reduce((s, c) => s + c.revenue, 0),
          students: courseCreators.reduce((s, c) => s + c.students_count, 0),
          products: courseCreators.reduce((s, c) => s + c.products_count, 0),
        },
        online_schools: {
          count: onlineSchools.length,
          revenue: onlineSchools.reduce((s, c) => s + c.revenue, 0),
          students: onlineSchools.reduce((s, c) => s + c.students_count, 0),
          teachers: onlineSchools.reduce((s, c) => s + c.teachers_count, 0),
          products: onlineSchools.reduce((s, c) => s + c.products_count, 0),
        },
      }
      return json({ success: true, creators: list, totals })
    }

    if (action === 'block_creator') {
      const { creator_id, blocked } = body as any
      const { error } = await supabase.from('creator_accounts').update({ is_blocked: !!blocked }).eq('id', creator_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    if (action === 'reset_creator_password') {
      const { creator_id, new_password } = body as any
      if (typeof new_password !== 'string' || new_password.length < 6 || new_password.length > 200) return json({ error: 'Bad password' }, 400)
      const hash = await hashPassword(new_password)
      const { error } = await supabase.from('creator_accounts').update({ password_hash: hash }).eq('id', creator_id)
      if (error) return json({ error: error.message }, 500)
      // also clean their sessions
      const { data: c } = await supabase.from('creator_accounts').select('login').eq('id', creator_id).maybeSingle()
      if (c?.login) await supabase.from('creator_sessions').delete().eq('creator_name', c.login)
      return json({ success: true })
    }

    if (action === 'delete_creator') {
      const { creator_id } = body as any
      const { data: c } = await supabase.from('creator_accounts').select('login').eq('id', creator_id).maybeSingle()
      if (!c) return json({ error: 'Not found' }, 404)
      // Cascade: products of this creator and their dependents
      const { data: prods } = await supabase.from('products').select('id').eq('creator_account_id', creator_id)
      const productIds = (prods ?? []).map((p: any) => p.id)
      if (productIds.length) {
        // delete schedules -> time_slots -> bookings cascade if FK set; if not, do manually
        const { data: scheds } = await supabase.from('schedules').select('id').in('product_id', productIds)
        const scheduleIds = (scheds ?? []).map((s: any) => s.id)
        if (scheduleIds.length) {
          const { data: slots } = await supabase.from('time_slots').select('id').in('schedule_id', scheduleIds)
          const slotIds = (slots ?? []).map((s: any) => s.id)
          if (slotIds.length) {
            await supabase.from('simple_bookings').delete().in('time_slot_id', slotIds)
            await supabase.from('time_slots').delete().in('id', slotIds)
          }
          await supabase.from('schedules').delete().in('id', scheduleIds)
        }
        await supabase.from('simple_purchases').delete().in('product_id', productIds)
        await supabase.from('materials').delete().in('product_id', productIds)
        await supabase.from('announcements').delete().in('product_id', productIds)
        await supabase.from('product_teachers').delete().in('product_id', productIds)
        await supabase.from('products').delete().in('id', productIds)
      }
      await supabase.from('creator_sessions').delete().eq('creator_name', c.login)
      await supabase.from('support_threads').delete().eq('user_type', 'creator').eq('user_ref', c.login)
      await supabase.from('creator_accounts').delete().eq('id', creator_id)
      return json({ success: true })
    }

    // SUPPORT
    if (action === 'support_list_threads') {
      const { data } = await supabase.from('support_threads').select('*').order('last_message_at', { ascending: false })
      return json({ success: true, threads: data ?? [] })
    }
    if (action === 'support_get_messages') {
      const { thread_id, mark_read } = body as any
      const { data } = await supabase.from('support_messages').select('*').eq('thread_id', thread_id).order('created_at', { ascending: true })
      if (mark_read) {
        await supabase.from('support_threads').update({ unread_for_moderator: 0 }).eq('id', thread_id)
        await supabase.from('support_messages').update({ read_at: new Date().toISOString() }).eq('thread_id', thread_id).eq('sender', 'user').is('read_at', null)
      }
      // Attachments are private (bucket or S3), so sign them for the moderator too.
      const messages = await withSignedAttachmentUrls(supabase, 'support-attachments', data ?? [])
      return json({ success: true, messages })
    }
    if (action === 'support_send_message') {
      const { thread_id, text } = body as any
      if (typeof text !== 'string' || !text.trim() || text.length > 4000) return json({ error: 'Bad text' }, 400)
      const { data: thread } = await supabase.from('support_threads').select('*').eq('id', thread_id).maybeSingle()
      if (!thread) return json({ error: 'Thread not found' }, 404)
      const { error } = await supabase.from('support_messages').insert({ thread_id, sender: 'moderator', text: text.trim() })
      if (error) return json({ error: error.message }, 500)
      await supabase.from('support_threads').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.trim().slice(0, 200),
        unread_for_user: (thread.unread_for_user ?? 0) + 1,
      }).eq('id', thread_id)
      return json({ success: true })
    }

    // TOPIC SUGGESTIONS
    if (action === 'list_topic_suggestions') {
      const { status } = body as any
      let query = supabase
        .from('topics')
        .select(`
          id,
          category_id,
          subcategory_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by,
          categories:category_id (name_ru, slug),
          subcategories:subcategory_id (name_ru, slug)
        `)
        .order('created_at', { ascending: false })

      if (status && status !== 'all') {
        query = query.eq('status', status)
      }
      const { data, error } = await query
      if (error) return json({ error: error.message }, 500)

      // Lookup profiles to resolve handle/username to display_name
      const createdByHandles = (data ?? []).map((r: any) => r.created_by).filter(Boolean)
      let profileMap: Record<string, string> = {}
      if (createdByHandles.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('handle, display_name')
          .in('handle', createdByHandles)
        if (profs) {
          profs.forEach((p: any) => {
            if (p.handle && p.display_name) profileMap[p.handle] = p.display_name
          })
        }
      }

      const items = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        normalized_name: row.normalized_name,
        category_id: row.category_id,
        subcategory_id: row.subcategory_id,
        category_name: row.categories?.name_ru || '',
        subcategory_name: row.subcategories?.name_ru || '',
        status: row.status,
        created_at: row.created_at,
        created_by: profileMap[row.created_by] || row.created_by,
      }))

      return json({ success: true, topics: items })
    }

    if (action === 'update_topic_suggestion') {
      const { topic_id, name } = body as any
      if (!topic_id || !name?.trim()) return json({ error: 'topic_id and name required' }, 400)
      const formatted = name.trim()
      const normalized = formatted.toLowerCase().replace(/\s+/g, ' ')
      const { error } = await supabase
        .from('topics')
        .update({
          name: formatted,
          normalized_name: normalized,
        })
        .eq('id', topic_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, name: formatted, normalized_name: normalized })
    }

    if (action === 'approve_topic_suggestion') {
      const { topic_id, name } = body as any
      if (!topic_id) return json({ error: 'No topic_id' }, 400)
      const updateData: Record<string, any> = {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'moderator',
      }
      if (name && typeof name === 'string' && name.trim()) {
        updateData.name = name.trim()
        updateData.normalized_name = name.trim().toLowerCase().replace(/\s+/g, ' ')
      }
      const { error } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', topic_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    if (action === 'reject_topic_suggestion') {
      const { topic_id } = body as any
      if (!topic_id) return json({ error: 'No topic_id' }, 400)
      const { error } = await supabase
        .from('topics')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'moderator',
        })
        .eq('id', topic_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // PRODUCT REPORTS
    if (action === 'list_reports') {
      const { status } = body as any
      let query = supabase
        .from('product_reports')
        .select(`
          id,
          product_id,
          user_id,
          reporter_name,
          reporter_contact,
          reason,
          description,
          status,
          created_at,
          reviewed_at,
          reviewed_by,
          products:product_id (id, title, creator_id)
        `)
        .order('created_at', { ascending: false })

      if (status && status !== 'all') {
        query = query.eq('status', status)
      }
      const { data, error } = await query
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, reports: data ?? [] })
    }

    if (action === 'update_report_status') {
      const { report_id, status } = body as any
      if (!report_id || !status) return json({ error: 'report_id and status required' }, 400)
      const { error } = await supabase
        .from('product_reports')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'moderator'
        })
        .eq('id', report_id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('moderator-api error', e)
    return json({ error: String(e) }, 500)
  }
})
