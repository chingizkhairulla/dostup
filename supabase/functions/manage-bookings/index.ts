import { json, optionsResponse } from '../_shared/http.ts'
import {
  assertCanManageProduct,
  productIdForSchedule,
  resolveCaller,
  serviceClient,
  unauthorized,
  forbidden,
} from '../_shared/session.ts'
import { buyerUsableScheduleIds } from '../_shared/subscription.ts'

function slotEndFromDuration(currentStart: string, currentEnd: string, newStart: string): string {
  const [sh, sm] = currentStart.split(':').map(Number)
  const [eh, em] = currentEnd.split(':').map(Number)
  const durationMin = eh * 60 + em - (sh * 60 + sm)
  const [nh, nm] = newStart.split(':').map(Number)
  const endTotal = nh * 60 + nm + durationMin
  return `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const supabase = serviceClient()
    const caller = await resolveCaller(supabase, body)
    if (!caller) return unauthorized()

    if (action === 'list_mine') {
      if (caller.kind !== 'user') return forbidden()
      const { data, error } = await supabase
        .from('simple_bookings')
        .select('*, time_slots (id, date, start_time, end_time), schedules (id, title, event_type)')
        .eq('buyer_profile_id', caller.userId)
        .order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      return json({ bookings: data ?? [] })
    }

    if (action === 'create') {
      if (caller.kind !== 'user') return forbidden()
      const timeSlotId = String(body.timeSlotId || '')
      const scheduleId = String(body.scheduleId || '')
      if (!timeSlotId || !scheduleId) return json({ error: 'Bad input' }, 400)
      const productId = await productIdForSchedule(supabase, scheduleId)
      if (!productId) return json({ error: 'Schedule not found' }, 404)
      const usable = await buyerUsableScheduleIds(supabase, caller.userId, [scheduleId])
      if (!usable.length) return forbidden()

      const { data: slot } = await supabase
        .from('time_slots')
        .select('id, max_participants, is_available')
        .eq('id', timeSlotId)
        .maybeSingle()
      if (!slot || !slot.is_available) return json({ error: 'Slot not available' }, 400)

      const { data: schedule } = await supabase
        .from('schedules')
        .select('id, event_type, max_participants')
        .eq('id', scheduleId)
        .maybeSingle()

      const slotLimit = slot.max_participants ?? (schedule?.event_type === 'individual' ? 1 : (schedule?.max_participants ?? 1))

      const { count } = await supabase
        .from('simple_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('time_slot_id', timeSlotId)
        .eq('status', 'confirmed')

      if ((count ?? 0) >= slotLimit) {
        return json({ error: 'Slot is full' }, 400)
      }

      const { data, error } = await supabase
        .from('simple_bookings')
        .insert({
          buyer_profile_id: caller.userId,
          time_slot_id: timeSlotId,
          schedule_id: scheduleId,
          status: 'confirmed',
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ booking: data })
    }

    if (action === 'cancel') {
      const bookingId = String(body.bookingId || '')
      if (!bookingId) return json({ error: 'Missing bookingId' }, 400)
      const { data: booking } = await supabase
        .from('simple_bookings')
        .select(`
          id, simple_user_id, buyer_profile_id, schedule_id,
          time_slot:time_slots(date, start_time),
          schedule:schedules(id, title, product_id, product:products(id, title))
        `)
        .eq('id', bookingId)
        .maybeSingle()
      if (!booking) return json({ error: 'Not found' }, 404)

      const productId = (booking as { schedule?: { product_id?: string } }).schedule?.product_id
      let cancelledBy = 'student'
      const bookingBuyerId = (booking as { buyer_profile_id?: string | null }).buyer_profile_id
        || booking.simple_user_id
      if (caller.kind === 'user' && caller.userId === bookingBuyerId) {
        cancelledBy = 'student'
      } else if (productId && (await assertCanManageProduct(supabase, caller, productId))) {
        cancelledBy = caller.kind === 'creator' ? 'creator' : 'teacher'
      } else {
        return forbidden()
      }

      const { data: student } = booking.simple_user_id
        ? await supabase.from('simple_users').select('name, phone').eq('id', booking.simple_user_id).maybeSingle()
        : { data: null }
      const { data: buyerProfile } = bookingBuyerId && !student
        ? await supabase.from('profiles').select('display_name').eq('id', bookingBuyerId).maybeSingle()
        : { data: null }

      await supabase.from('booking_cancellations').insert({
        booking_id: bookingId,
        user_name: student?.name || buyerProfile?.display_name || (caller.kind === 'user' ? caller.name : 'Ученик'),
        simple_user_id: bookingBuyerId || booking.simple_user_id,
        product_title: (booking as { schedule?: { product?: { title?: string } } }).schedule?.product?.title || '',
        product_id: productId,
        schedule_id: (booking as { schedule?: { id?: string } }).schedule?.id,
        schedule_title: (booking as { schedule?: { title?: string } }).schedule?.title || '',
        slot_date: (booking as { time_slot?: { date?: string } }).time_slot?.date,
        slot_time: (booking as { time_slot?: { start_time?: string } }).time_slot?.start_time,
        cancelled_by: body.cancelledBy || cancelledBy,
        cancellation_reasons: Array.isArray(body.reasons) ? body.reasons : [],
        cancellation_comment: typeof body.comment === 'string' ? body.comment : null,
      })

      const { error } = await supabase.from('simple_bookings').delete().eq('id', bookingId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'list_cancellations') {
      const productIds = Array.isArray(body.productIds) ? body.productIds.filter((x: unknown) => typeof x === 'string') : []
      if (caller.kind === 'user' && caller.role !== 'teacher') {
        const { data } = await supabase
          .from('booking_cancellations')
          .select('*')
          .eq('simple_user_id', caller.userId)
          .order('cancelled_at', { ascending: false })
        return json({ cancellations: data ?? [] })
      }
      if (!productIds.length) return json({ cancellations: [] })
      for (const pid of productIds) {
        if (!(await assertCanManageProduct(supabase, caller, pid))) return forbidden()
      }
      const { data } = await supabase
        .from('booking_cancellations')
        .select('*')
        .in('product_id', productIds)
        .order('cancelled_at', { ascending: false })
      return json({ cancellations: data ?? [] })
    }

    if (action === 'list_reschedule_requests') {
      if (caller.kind === 'user' && caller.role !== 'teacher') {
        const { data } = await supabase
          .from('reschedule_requests')
          .select('*')
          .eq('simple_user_id', caller.userId)
          .eq('status', body.status || 'pending')
        return json({ requests: data ?? [] })
      }
      const productIds = Array.isArray(body.productIds) ? body.productIds.filter((x: unknown) => typeof x === 'string') : []
      const scheduleIds = Array.isArray(body.scheduleIds) ? body.scheduleIds.filter((x: unknown) => typeof x === 'string') : []
      let q = supabase.from('reschedule_requests').select('*')
      if (productIds.length) q = q.in('product_id', productIds)
      if (scheduleIds.length) q = q.in('schedule_id', scheduleIds)
      if (body.status) q = q.eq('status', body.status)
      if (body.requestedBy) q = q.eq('requested_by', body.requestedBy)
      const { data } = await q
      const userIds = [...new Set((data ?? []).map((r: { simple_user_id: string | null }) => r.simple_user_id).filter(Boolean))] as string[]
      const { data: users } = userIds.length
        ? await supabase.from('simple_users').select('id, name').in('id', userIds)
        : { data: [] as { id: string; name: string }[] }
      const userMap = new Map((users ?? []).map((u) => [u.id, u.name]))
      return json({
        requests: (data ?? []).map((r: { simple_user_id: string | null }) => ({
          ...r,
          user_name: r.simple_user_id ? userMap.get(r.simple_user_id) || 'Ученик' : 'Ученик',
        })),
      })
    }

    if (action === 'create_reschedule_request') {
      const bookingId = String(body.bookingId || '')
      if (!bookingId) return json({ error: 'Missing bookingId' }, 400)

      if (caller.kind === 'user' && caller.role !== 'teacher') {
        await supabase
          .from('reschedule_requests')
          .delete()
          .eq('booking_id', bookingId)
          .eq('simple_user_id', caller.userId)
          .eq('status', 'pending')
        const { error } = await supabase.from('reschedule_requests').insert({
          booking_id: bookingId,
          simple_user_id: caller.userId,
          schedule_id: body.scheduleId,
          product_id: body.productId,
          product_title: body.productTitle,
          old_date: body.oldDate,
          old_time: body.oldTime,
          new_date: body.newDate,
          new_time: body.newTime,
          reasons: body.reasons || [],
          comment: body.comment || null,
          status: 'pending',
        })
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      const slotId = String(body.slotId || '')
      const scheduleId = String(body.scheduleId || '')
      const { data: slot } = await supabase
        .from('time_slots')
        .select('date, start_time, end_time, schedule_id')
        .eq('id', slotId)
        .maybeSingle()
      if (!slot) return json({ error: 'Slot not found' }, 404)
      const productId = await productIdForSchedule(supabase, scheduleId || slot.schedule_id)
      if (!productId || !(await assertCanManageProduct(supabase, caller, productId))) return forbidden()

      const { data: bookings } = await supabase
        .from('simple_bookings')
        .select('id, simple_user_id, schedule_id')
        .eq('time_slot_id', slotId)
        .eq('status', 'confirmed')
      if (!bookings?.length) return json({ error: 'No bookings to reschedule' }, 400)

      const { data: schedule } = await supabase
        .from('schedules')
        .select('id, product_id, product:products(id, title)')
        .eq('id', scheduleId)
        .single()
      const productTitle = (schedule as { product?: { title?: string } } | null)?.product?.title || ''
      const requestedBy = caller.kind === 'creator' ? 'creator' : 'teacher'

      for (const booking of bookings) {
        await supabase.from('reschedule_requests').delete().eq('booking_id', booking.id).eq('status', 'pending')
        await supabase.from('reschedule_requests').insert({
          booking_id: booking.id,
          simple_user_id: booking.simple_user_id,
          schedule_id: scheduleId,
          product_id: productId,
          product_title: productTitle,
          old_date: slot.date,
          old_time: slot.start_time,
          new_date: body.newDate,
          new_time: body.newStartTime,
          reasons: body.reasons || [],
          comment: body.comment || null,
          status: 'pending',
          requested_by: requestedBy,
          teacher_id: caller.kind === 'user' ? caller.userId : body.teacherId || null,
        })
      }
      return json({ ok: true })
    }

    if (action === 'cancel_reschedule_request') {
      const requestId = String(body.requestId || '')
      if (!requestId) return json({ error: 'Missing requestId' }, 400)
      const { data: row } = await supabase.from('reschedule_requests').select('*').eq('id', requestId).maybeSingle()
      if (!row) return json({ error: 'Not found' }, 404)
      if (caller.kind === 'user' && caller.role !== 'teacher') {
        if (row.simple_user_id !== caller.userId) return forbidden()
      } else if (row.product_id && !(await assertCanManageProduct(supabase, caller, row.product_id))) {
        return forbidden()
      }
      const { error } = await supabase.from('reschedule_requests').delete().eq('id', requestId).eq('status', 'pending')
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'approve_reschedule') {
      const requestId = String(body.requestId || '')
      if (!requestId) return json({ error: 'Missing requestId' }, 400)
      const { data: request } = await supabase.from('reschedule_requests').select('*').eq('id', requestId).maybeSingle()
      if (!request) return json({ error: 'Not found' }, 404)

      const isStudent = caller.kind === 'user' && caller.role !== 'teacher'
      if (isStudent) {
        if (request.simple_user_id !== caller.userId) return forbidden()
      } else if (request.product_id && !(await assertCanManageProduct(supabase, caller, request.product_id))) {
        return forbidden()
      }

      const { error: updateError } = await supabase
        .from('reschedule_requests')
        .update({ status: 'approved', responded_at: new Date().toISOString() })
        .eq('id', requestId)
      if (updateError) return json({ error: updateError.message }, 500)

      const { data: booking } = await supabase
        .from('simple_bookings')
        .select('time_slot_id')
        .eq('id', request.booking_id)
        .maybeSingle()

      if (booking?.time_slot_id) {
        const { data: currentSlot } = await supabase
          .from('time_slots')
          .select('start_time, end_time')
          .eq('id', booking.time_slot_id)
          .maybeSingle()
        let newEndTime = request.new_time
        if (currentSlot) {
          newEndTime = slotEndFromDuration(currentSlot.start_time, currentSlot.end_time, request.new_time)
        }
        await supabase
          .from('time_slots')
          .update({ date: request.new_date, start_time: request.new_time, end_time: newEndTime })
          .eq('id', booking.time_slot_id)
      }

      if (!isStudent) {
        await supabase.from('booking_reschedules').insert({
          booking_id: request.booking_id,
          simple_user_id: request.simple_user_id,
          schedule_id: request.schedule_id,
          product_id: request.product_id,
          product_title: request.product_title,
          old_date: request.old_date,
          old_time: request.old_time,
          new_date: request.new_date,
          new_time: request.new_time,
          rescheduled_by: caller.kind === 'creator' ? 'creator' : 'teacher',
          reasons: ['Запрос ученика подтверждён'],
        })
      }
      return json({ ok: true })
    }

    if (action === 'reject_reschedule') {
      const requestId = String(body.requestId || '')
      if (!requestId) return json({ error: 'Missing requestId' }, 400)
      const { data: request } = await supabase.from('reschedule_requests').select('*').eq('id', requestId).maybeSingle()
      if (!request) return json({ error: 'Not found' }, 404)
      const isStudent = caller.kind === 'user' && caller.role !== 'teacher'
      if (isStudent) {
        if (request.simple_user_id !== caller.userId) return forbidden()
      } else if (request.product_id && !(await assertCanManageProduct(supabase, caller, request.product_id))) {
        return forbidden()
      }
      const { error } = await supabase
        .from('reschedule_requests')
        .update({
          status: 'rejected',
          response_comment: typeof body.comment === 'string' ? body.comment : null,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'reschedule_slot') {
      const slotId = String(body.slotId || '')
      const scheduleId = String(body.scheduleId || '')
      if (!slotId || !scheduleId) return json({ error: 'Bad input' }, 400)
      const productId = await productIdForSchedule(supabase, scheduleId)
      if (!productId || !(await assertCanManageProduct(supabase, caller, productId))) return forbidden()

      const { data: slot } = await supabase
        .from('time_slots')
        .select('date, start_time, end_time, schedule_id')
        .eq('id', slotId)
        .maybeSingle()
      if (!slot) return json({ error: 'Slot not found' }, 404)

      const { error: updateError } = await supabase
        .from('time_slots')
        .update({ date: body.newDate, start_time: body.newStartTime, end_time: body.newEndTime })
        .eq('id', slotId)
      if (updateError) return json({ error: updateError.message }, 500)

      const { data: bookings } = await supabase
        .from('simple_bookings')
        .select('id, simple_user_id, schedule_id')
        .eq('time_slot_id', slotId)
        .eq('status', 'confirmed')
      if (!bookings?.length) return json({ ok: true })

      const { data: schedule } = await supabase
        .from('schedules')
        .select('id, product_id, product:products(id, title)')
        .eq('id', scheduleId)
        .single()
      const productTitle = (schedule as { product?: { title?: string } } | null)?.product?.title || ''
      const rescheduledBy = caller.kind === 'creator' ? 'creator' : 'teacher'
      for (const booking of bookings) {
        await supabase.from('booking_reschedules').insert({
          booking_id: booking.id,
          simple_user_id: booking.simple_user_id,
          schedule_id: scheduleId,
          product_id: productId,
          product_title: productTitle,
          old_date: slot.date,
          old_time: slot.start_time,
          new_date: body.newDate,
          new_time: body.newStartTime,
          rescheduled_by: rescheduledBy,
          reasons: body.reasons || [],
          comment: body.comment || null,
        })
      }
      return json({ ok: true })
    }

    if (action === 'list_reschedules') {
      if (caller.kind !== 'user') return forbidden()
      const { data } = await supabase
        .from('booking_reschedules')
        .select('*')
        .eq('simple_user_id', caller.userId)
        .order('created_at', { ascending: false })
      return json({ reschedules: data ?? [] })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-bookings error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
