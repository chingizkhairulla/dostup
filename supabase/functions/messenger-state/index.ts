import { json, optionsResponse } from '../_shared/http.ts'
import { resolveCaller, serviceClient, unauthorized } from '../_shared/session.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const db = serviceClient()
    const caller = await resolveCaller(db, body)
    if (!caller) return unauthorized()
    const { data: account, error: accountError } = caller.kind === 'creator'
      ? await db.from('creator_accounts').select('profile_id').eq('id', caller.accountId).single()
      : { data: null, error: null }
    if (accountError) throw accountError
    const profileId = caller.kind === 'creator' ? account?.profile_id : caller.userId
    if (!profileId) return json({ error: 'Profile unavailable' }, 409)
    if (body.action === 'claim_install_hint') {
      const { data, error } = await db.rpc('claim_messenger_install_hint', { p_profile: profileId })
      if (error) throw error
      return json({ show: data === true })
    }
    if (body.action === 'unread') {
      // No-op until the campaign is explicitly enabled after review.
      const welcome = await db.rpc('deliver_support_welcome', { p_profile: profileId })
      if (welcome.error) throw welcome.error
      const type = caller.kind === 'creator' ? 'creator' : caller.role === 'teacher' ? 'teacher' : 'student'
      const ref = caller.kind === 'creator' ? caller.login : caller.userId
      const [support, direct] = await Promise.all([
        db.from('support_threads').select('unread_for_user').eq('user_type', type).eq('user_ref', ref).maybeSingle(),
        caller.kind === 'creator'
          ? db.from('direct_threads').select('unread_for_creator').eq('creator_account_id', caller.accountId)
          : db.from('direct_threads').select('unread_for_buyer').eq('buyer_profile_id', caller.userId),
      ])
      if (support.error || direct.error) throw support.error || direct.error
      const count = (direct.data ?? []).reduce((sum, row) => sum + Number('unread_for_creator' in row ? row.unread_for_creator : row.unread_for_buyer), 0)
      return json({ support: support.data?.unread_for_user ?? 0, direct: count })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('messenger-state', error)
    return json({ error: 'Не удалось загрузить настройки сообщений' }, 500)
  }
})
