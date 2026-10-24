import { json, optionsResponse } from '../_shared/http.ts'
import { resolveUser, serviceClient, unauthorized } from '../_shared/session.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const supabase = serviceClient()
    const user = await resolveUser(supabase, String(body.sessionToken || ''))
    if (!user) return unauthorized()

    if (action === 'set_role') {
      const role = body.role === 'creator' ? 'creator' : 'student'
      const { error } = await supabase.from('simple_users').update({ role }).eq('id', user.userId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, role })
    }

    if (action === 'get_prefs') {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.userId)
        .maybeSingle()
      return json({ prefs: data })
    }

    if (action === 'save_prefs') {
      const prefs = body.prefs && typeof body.prefs === 'object' ? body.prefs as Record<string, unknown> : null
      if (!prefs) return json({ error: 'Missing prefs' }, 400)
      const row = {
        user_id: user.userId,
        reminder_24h: !!prefs.reminder_24h,
        reminder_morning: !!prefs.reminder_morning,
        morning_time: typeof prefs.morning_time === 'string' ? prefs.morning_time : '08:00',
        reminder_2h: !!prefs.reminder_2h,
        payment_reminder_week: prefs.payment_reminder_week !== undefined ? !!prefs.payment_reminder_week : true,
        payment_reminder_day: prefs.payment_reminder_day !== undefined ? !!prefs.payment_reminder_day : true,
        updated_at: new Date().toISOString(),
      }
      const { data: existing } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('user_id', user.userId)
        .maybeSingle()
      if (existing) {
        const { error } = await supabase.from('notification_preferences').update(row).eq('id', existing.id)
        if (error) return json({ error: error.message }, 500)
      } else {
        const { error } = await supabase.from('notification_preferences').insert(row)
        if (error) return json({ error: error.message }, 500)
      }
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('manage-account error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
