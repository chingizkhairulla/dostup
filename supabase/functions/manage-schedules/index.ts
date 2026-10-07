import { json, optionsResponse } from '../_shared/http.ts'
import {
  assertCanManageProduct,
  creatorProductIds,
  productIdForSchedule,
  resolveCaller,
  serviceClient,
  unauthorized,
  forbidden,
} from '../_shared/session.ts'
import { buyerAccessibleProductIds } from '../_shared/subscription.ts'

async function ownsSchedule(supabase: ReturnType<typeof serviceClient>, caller: Awaited<ReturnType<typeof resolveCaller>>, scheduleId: string) {
  if (!caller) return false
  const productId = await productIdForSchedule(supabase, scheduleId)
  if (!productId) return false
  return assertCanManageProduct(supabase, caller, productId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const supabase = serviceClient()
    const caller = await resolveCaller(supabase, body)
    if (!caller) return unauthorized()

    const productIdsForCaller = async (): Promise<string[]> => {
      if (caller.kind === 'creator') return creatorProductIds(supabase, caller.accountId)
      if (caller.role === 'teacher') {
        const { data } = await supabase
          .from('product_teachers')
          .select('product_id')
          .ilike('teacher_name', caller.name)
        return (data ?? []).map((r: { product_id: string }) => r.product_id)
      }
      return []
    }

    if (action === 'me') {
      if (caller.kind !== 'user') return json({ userId: null })
      return json({ userId: caller.userId, name: caller.name, role: caller.role })
    }

    if (action === 'list_products') {
      const ids = await productIdsForCaller()
      if (!ids.length) return json({ products: [] })
      const { data } = await supabase.from('products').select('id, title').in('id', ids)
      return json({ products: data ?? [] })
    }

    if (action === 'list_schedules') {
      const ids = Array.isArray(body.productIds) ? body.productIds.filter((x: unknown) => typeof x === 'string') : []
      const allowed = await productIdsForCaller()
      const filtered = ids.length ? ids.filter((id: string) => allowed.includes(id)) : allowed
      if (!filtered.length) return json({ schedules: [] })
      let q = supabase.from('schedules').select('*, product:products(title)').in('product_id', filtered)
      if (caller.kind === 'user' && caller.role === 'teacher') {
        q = q.eq('teacher_id', caller.userId)
      } else if (body.creatorOnly) {
        q = q.is('teacher_id', null)
      }
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ schedules: data ?? [] })
    }

    if (action === 'list_slots') {
      const scheduleIds = Array.isArray(body.scheduleIds) ? body.scheduleIds.filter((x: unknown) => typeof x === 'string') : []
      if (!scheduleIds.length) return json({ slots: [] })
      for (const sid of scheduleIds) {
        if (!(await ownsSchedule(supabase, caller, sid))) return forbidden()
      }
      let q = supabase.from('time_slots').select('*').in('schedule_id', scheduleIds)
      if (body.fromDate) q = q.gte('date', body.fromDate)
      if (body.toDate) q = q.lte('date', body.toDate)
      const { data, error } = await q.order('date').order('start_time')
      if (error) return json({ error: error.message }, 500)
      return json({ slots: data ?? [] })
    }

    if (action === 'list_slot_dates') {
      const scheduleId = String(body.scheduleId || '')
      if (!scheduleId) return json({ dates: [] })
      if (!(await ownsSchedule(supabase, caller, scheduleId))) return forbidden()
      const { data } = await supabase.from('time_slots').select('date').eq('schedule_id', scheduleId).order('date')
      const dates = [...new Set((data ?? []).map((s: { date: string }) => s.date))]
      return json({ dates })
    }

    if (action === 'list_bookings_for_slots') {
      const slotIds = Array.isArray(body.slotIds) ? body.slotIds.filter((x: unknown) => typeof x === 'string') : []
      if (!slotIds.length) return json({ bookings: [] })
      const { data, error } = await supabase
        .from('simple_bookings')
        .select('id, time_slot_id, simple_user_id, schedule_id, status')
        .in('time_slot_id', slotIds)
      if (error) return json({ error: error.message }, 500)
      const userIds = [...new Set((data ?? []).map((b: { simple_user_id: string }) => b.simple_user_id))]
      const { data: users } = userIds.length
        ? await supabase.from('simple_users').select('id, name, phone').in('id', userIds)
        : { data: [] as { id: string; name: string; phone: string | null }[] }
      const userMap = new Map((users ?? []).map((u) => [u.id, u]))
      return json({
        bookings: (data ?? []).map((b: { simple_user_id: string }) => ({
          ...b,
          user: userMap.get(b.simple_user_id) || null,
        })),
      })
    }

    if (action === 'list_outgoing_reschedules') {
      const ids = await productIdsForCaller()
      if (!ids.length) return json({ requests: [] })
      let q = supabase
        .from('reschedule_requests')
        .select('id, booking_id, new_date, new_time, status')
        .in('product_id', ids)
        .eq('status', 'pending')
      if (caller.kind === 'user') q = q.eq('requested_by', 'teacher')
      else q = q.eq('requested_by', 'creator')
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ requests: data ?? [] })
    }

    if (action === 'create_schedule') {
      const productId = String(body.productId || '')
      const title = String(body.title || '').trim()
      if (!productId || !title) return json({ error: 'Bad input' }, 400)
      if (!(await assertCanManageProduct(supabase, caller, productId))) return forbidden()
      const row: Record<string, unknown> = {
        product_id: productId,
        title,
        event_type: body.eventType === 'group' ? 'group' : 'individual',
        max_participants: body.maxParticipants != null ? Number(body.maxParticipants) : null,
      }
      if (caller.kind === 'user') row.teacher_id = caller.userId
      const { data, error } = await supabase.from('schedules').insert(row).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ schedule: data })
    }

    if (action === 'update_schedule') {
      const id = String(body.id || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates as Record<string, unknown> : {}
      if (!id) return json({ error: 'Missing id' }, 400)
      if (!(await ownsSchedule(supabase, caller, id))) return forbidden()
      delete updates.id
      delete updates.product_id
      delete updates.teacher_id
      const { data, error } = await supabase.from('schedules').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ schedule: data })
    }

    if (action === 'delete_schedule') {
      const id = String(body.id || '')
      if (!id) return json({ error: 'Missing id' }, 400)
      if (!(await ownsSchedule(supabase, caller, id))) return forbidden()
      const { error } = await supabase.from('schedules').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'create_slots') {
      const slots = Array.isArray(body.slots) ? body.slots : []
      if (!slots.length) return json({ error: 'No slots' }, 400)
      const scheduleId = String(slots[0].schedule_id || body.scheduleId || '')
      if (!(await ownsSchedule(supabase, caller, scheduleId))) return forbidden()

      // Deduplicate: avoid creating slots that already exist for this schedule on the same date and start_time
      const dates = Array.from(new Set(slots.map((s: any) => String(s.date))))
      const { data: existingSlots } = await supabase
        .from('time_slots')
        .select('date, start_time')
        .eq('schedule_id', scheduleId)
        .in('date', dates)

      const existingSet = new Set((existingSlots || []).map((s: any) => `${s.date}_${String(s.start_time).slice(0, 5)}`))
      const newSlots = slots.filter((s: any) => !existingSet.has(`${s.date}_${String(s.start_time).slice(0, 5)}`))

      if (newSlots.length === 0) {
        return json({ slots: [], count: 0 })
      }

      const { data, error } = await supabase.from('time_slots').insert(newSlots).select()
      if (error) return json({ error: error.message }, 500)
      return json({ slots: data ?? [], count: newSlots.length })
    }

    if (action === 'delete_slot') {
      const slotId = String(body.slotId || '')
      if (!slotId) return json({ error: 'Missing slotId' }, 400)
      const { data: slot } = await supabase.from('time_slots').select('schedule_id').eq('id', slotId).maybeSingle()
      if (!slot) return json({ error: 'Not found' }, 404)
      if (!(await ownsSchedule(supabase, caller, slot.schedule_id))) return forbidden()
      const { error } = await supabase.from('time_slots').delete().eq('id', slotId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'delete_slots') {
      const scheduleId = String(body.scheduleId || '')
      if (!scheduleId) return json({ error: 'Missing scheduleId' }, 400)
      if (!(await ownsSchedule(supabase, caller, scheduleId))) return forbidden()
      let q = supabase.from('time_slots').delete().eq('schedule_id', scheduleId)
      if (body.dates !== 'all' && Array.isArray(body.dates)) q = q.in('date', body.dates)
      const { error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'delete_slot_with_bookings') {
      const slotId = String(body.slotId || '')
      const reasons = Array.isArray(body.reasons) ? body.reasons : []
      const comment = typeof body.comment === 'string' ? body.comment : null
      if (!slotId) return json({ error: 'Missing slotId' }, 400)
      const { data: slotData } = await supabase
        .from('time_slots')
        .select('date, start_time, schedule_id')
        .eq('id', slotId)
        .maybeSingle()
      if (!slotData) return json({ error: 'Not found' }, 404)
      if (!(await ownsSchedule(supabase, caller, slotData.schedule_id))) return forbidden()

      const { data: slotBookings } = await supabase
        .from('simple_bookings')
        .select('id, simple_user_id')
        .eq('time_slot_id', slotId)

      if (slotBookings?.length) {
        const { data: scheduleData } = await supabase
          .from('schedules')
          .select('id, title, product_id, product:products(title)')
          .eq('id', slotData.schedule_id)
          .single()
        const userIds = slotBookings.map((b: { simple_user_id: string }) => b.simple_user_id)
        const { data: usersData } = await supabase.from('simple_users').select('id, name, phone').in('id', userIds)
        const cancelledBy = caller.kind === 'creator' ? 'creator' : 'teacher'
        const cancellationRecords = slotBookings.map((b: { id: string; simple_user_id: string }) => {
          const u = usersData?.find((x: { id: string }) => x.id === b.simple_user_id)
          return {
            booking_id: b.id,
            product_id: scheduleData?.product_id || '',
            product_title: (scheduleData?.product as { title?: string } | null)?.title || '',
            schedule_id: scheduleData?.id || null,
            schedule_title: scheduleData?.title || null,
            simple_user_id: b.simple_user_id,
            user_name: u?.name || '—',
            user_phone: u?.phone || null,
            slot_date: slotData.date,
            slot_time: slotData.start_time,
            cancelled_by: cancelledBy,
            cancellation_reasons: reasons,
            cancellation_comment: comment,
          }
        })
        const { error: cancError } = await supabase.from('booking_cancellations').insert(cancellationRecords)
        if (cancError) return json({ error: cancError.message }, 500)
      }

      const { error: bookingsError } = await supabase.from('simple_bookings').delete().eq('time_slot_id', slotId)
      if (bookingsError) return json({ error: bookingsError.message }, 500)
      const { error: slotError } = await supabase.from('time_slots').delete().eq('id', slotId)
      if (slotError) return json({ error: slotError.message }, 500)
      return json({ ok: true })
    }

    if (action === 'update_slot') {
      const slotId = String(body.slotId || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates as Record<string, unknown> : {}
      if (!slotId) return json({ error: 'Missing slotId' }, 400)
      const { data: slot } = await supabase.from('time_slots').select('schedule_id').eq('id', slotId).maybeSingle()
      if (!slot) return json({ error: 'Not found' }, 404)
      if (!(await ownsSchedule(supabase, caller, slot.schedule_id))) return forbidden()
      const { error } = await supabase.from('time_slots').update(updates).eq('id', slotId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'set_lesson_link') {
      const scheduleId = String(body.scheduleId || '')
      const link = typeof body.link === 'string' ? body.link : null
      if (!scheduleId) return json({ error: 'Missing scheduleId' }, 400)
      if (!(await ownsSchedule(supabase, caller, scheduleId))) return forbidden()
      let q = supabase.from('time_slots').update({ lesson_link: link }).eq('schedule_id', scheduleId)
      if (body.dates !== 'all' && Array.isArray(body.dates)) q = q.in('date', body.dates)
      const { error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'student_list_schedules') {
      if (caller.kind !== 'user') return forbidden()
      const productIds = Array.isArray(body.productIds) ? body.productIds.filter((x: unknown) => typeof x === 'string') : []
      if (!productIds.length) return json({ schedules: [] })
      const allowedIds = await buyerAccessibleProductIds(supabase, caller.userId)
      const filtered = productIds.filter((id: string) => allowedIds.includes(id))
      if (!filtered.length) return json({ schedules: [] })
      const { data: purchases } = await supabase
        .from('simple_purchases')
        .select('product_id, assigned_teacher_id, can_choose_teacher')
        .eq('buyer_profile_id', caller.userId)
        .eq('status', 'completed')
        .in('product_id', filtered)
      const { data, error } = await supabase.from('schedules').select('*').in('product_id', filtered)
      if (error) return json({ error: error.message }, 500)
      return json({ schedules: data ?? [], purchases: purchases ?? [] })
    }

    if (action === 'student_list_slots') {
      if (caller.kind !== 'user') return forbidden()
      const scheduleIds = Array.isArray(body.scheduleIds) ? body.scheduleIds.filter((x: unknown) => typeof x === 'string') : []
      if (!scheduleIds.length) return json({ slots: [] })
      const { data: schedules } = await supabase.from('schedules').select('id, product_id').in('id', scheduleIds)
      const scheduleProductIds = [...new Set((schedules ?? []).map((s: { product_id: string }) => s.product_id))]
      const allowedIds = await buyerAccessibleProductIds(supabase, caller.userId)
      const allowedProducts = new Set(
        scheduleProductIds.filter((id: string) => allowedIds.includes(id)),
      )
      const allowedSchedules = (schedules ?? [])
        .filter((s: { product_id: string }) => allowedProducts.has(s.product_id))
        .map((s: { id: string }) => s.id)
      if (!allowedSchedules.length) return json({ slots: [] })
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .in('schedule_id', allowedSchedules)
        .order('date')
        .order('start_time')
      if (error) return json({ error: error.message }, 500)
      return json({ slots: data ?? [] })
    }

    if (action === 'create_google_meet_link') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
      if (!clientId || !clientSecret) {
        return json({ error: 'Google credentials not configured' }, 500)
      }

      // Try teacher/creator's own token first
      let refreshToken: string | null = null
      const callerId = caller.kind === 'creator' ? caller.accountId : caller.userId
      if (callerId) {
        const { data: tokenRow } = await supabase
          .from('teacher_google_tokens')
          .select('refresh_token')
          .eq('user_id', callerId)
          .maybeSingle()
        if (tokenRow?.refresh_token) refreshToken = tokenRow.refresh_token
      }
      if (!refreshToken) refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') || null
      if (!refreshToken) return json({ error: 'No Google token available' }, 500)

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.access_token) {
        console.error('Failed to get access token:', tokenData)
        return json({ error: 'Failed to get Google access token' }, 500)
      }

      const eventTitle = String(body.title || 'Урок')
      const startIso = body.startIso ? String(body.startIso) : new Date().toISOString()
      const endIso = body.endIso ? String(body.endIso) : new Date(Date.now() + 60 * 60 * 1000).toISOString()

      const eventRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: eventTitle,
          start: { dateTime: startIso, timeZone: 'UTC' },
          end: { dateTime: endIso, timeZone: 'UTC' },
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      })
      const eventData = await eventRes.json()
      const meetLink = eventData?.conferenceData?.entryPoints?.find(
        (ep: { entryPointType: string }) => ep.entryPointType === 'video'
      )?.uri || null

      if (!meetLink) {
        console.error('Failed to create Meet link:', eventData)
        return json({ error: 'Failed to create Google Meet link' }, 500)
      }

      return json({ meetLink })
    }

    if (action === 'get_google_oauth_url') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      if (!clientId) return json({ error: 'Google not configured' }, 500)
      const redirectUri = 'https://trydostup.online/auth/google/meet-callback'
      const scope = 'https://www.googleapis.com/auth/calendar.events'
      const callerId = caller.kind === 'creator' ? caller.accountId : caller.userId
      const tokenVal = String(body.token || body.sessionToken || '')
      const state = btoa(JSON.stringify({ userId: callerId, token: tokenVal }))
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`
      return json({ url })
    }

    if (action === 'save_google_meet_token') {
      const code = String(body.code || '')
      const stateStr = String(body.state || '')
      if (!code || !stateStr) return json({ error: 'Missing code or state' }, 400)
      let userId: string
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(stateStr)))
        userId = decoded.userId
      } catch {
        return json({ error: 'Invalid state' }, 400)
      }
      if (!userId) return json({ error: 'Missing userId in state' }, 400)
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
      const redirectUri = 'https://trydostup.online/auth/google/meet-callback'
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.refresh_token) {
        console.error('No refresh_token from Google:', tokenData)
        return json({ error: 'No refresh token received' }, 400)
      }
      await supabase.from('teacher_google_tokens').upsert({ user_id: userId, refresh_token: tokenData.refresh_token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      return json({ ok: true })
    }

    if (action === 'check_google_token') {
      const callerId = caller.kind === 'creator' ? caller.accountId : caller.userId
      if (!callerId) return json({ hasToken: false })
      const { data } = await supabase.from('teacher_google_tokens').select('id').eq('user_id', callerId).maybeSingle()
      return json({ hasToken: Boolean(data) })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-schedules error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
