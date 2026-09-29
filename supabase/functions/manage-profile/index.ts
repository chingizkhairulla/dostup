import { json, optionsResponse } from '../_shared/http.ts'
import {
  PROFILE_COLUMNS,
  isDisplayNameTaken,
  issueAppSession,
  listProfiles,
  resolveSessionProfileId,
  type ProfileRow,
} from '../_shared/profiles.ts'
import { serviceClient } from '../_shared/session.ts'

const HANDLE_RE = /^[a-z0-9-]{3,30}$/

function parseDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, 100)
  return trimmed.length >= 2 ? trimmed : null
}

/**
 * Resolve auth_user_id from:
 *  1) JWT in Authorization header (supabase.auth.getUser)
 *  2) session token in body or x-creator-token header (creator_sessions lookup)
 *  3) hintProfileId fallback
 */
async function resolveAuthUserId(
  supabase: ReturnType<typeof serviceClient>,
  req: Request,
  token: string,
  hintProfileId?: string | null,
): Promise<string | null> {
  // 1. JWT from Authorization header
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (jwt && jwt !== anonKey) {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt)
      if (user?.id && !userErr) return user.id
    } catch {
      // JWT invalid or expired
    }
  }

  // 2. Session token from body or x-creator-token header
  const headerToken = req.headers.get('x-creator-token')?.trim() || ''
  const effectiveToken = token || headerToken

  if (effectiveToken) {
    const { data: session } = await supabase
      .from('creator_sessions')
      .select('token, creator_name, profile_id, expires_at')
      .eq('token', effectiveToken)
      .maybeSingle()

    if (session) {
      // 2a. Direct profile_id
      if (session.profile_id) {
        const { data: sp } = await supabase
          .from('profiles')
          .select('auth_user_id')
          .eq('id', session.profile_id)
          .maybeSingle()
        if (sp?.auth_user_id) return sp.auth_user_id
      }

      // 2b. buyer:profile_id
      if (typeof session.creator_name === 'string' && session.creator_name.startsWith('buyer:')) {
        const buyerPid = session.creator_name.slice(6).trim()
        if (buyerPid) {
          const { data: sp } = await supabase
            .from('profiles')
            .select('auth_user_id')
            .eq('id', buyerPid)
            .maybeSingle()
          if (sp?.auth_user_id) return sp.auth_user_id
        }
      }

      // 2c. creator_accounts login
      if (session.creator_name) {
        const { data: acc } = await supabase
          .from('creator_accounts')
          .select('auth_user_id, profile_id')
          .ilike('login', session.creator_name)
          .maybeSingle()
        if (acc?.auth_user_id) return acc.auth_user_id
        if (acc?.profile_id) {
          const { data: sp } = await supabase
            .from('profiles')
            .select('auth_user_id')
            .eq('id', acc.profile_id)
            .maybeSingle()
          if (sp?.auth_user_id) return sp.auth_user_id
        }
      }
    }
  }

  // 3. Fallback: if hintProfileId given, resolve user of that profile
  if (hintProfileId) {
    const { data: targetProf } = await supabase
      .from('profiles')
      .select('auth_user_id')
      .eq('id', hintProfileId)
      .maybeSingle()
    if (targetProf?.auth_user_id) {
      return targetProf.auth_user_id
    }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const action = typeof body.action === 'string' ? body.action : 'get_handle'

    const hintProfileId = typeof body.profileId === 'string' && body.profileId.trim().length > 0
      ? body.profileId.trim()
      : typeof body.profile_id === 'string' && body.profile_id.trim().length > 0
        ? body.profile_id.trim()
        : null

    const supabase = serviceClient()

    // --- AUTH ---
    const authUserId = await resolveAuthUserId(supabase, req, token, hintProfileId)
    if (!authUserId) return json({ error: 'Unauthorized' }, 401)

    // --- Resolve target profile ---
    let row: ProfileRow | null = null

    if (hintProfileId) {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', hintProfileId)
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      row = data as ProfileRow | null
    }

    // Fallback: find the user's first profile (buyer preferred)
    if (!row) {
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('auth_user_id', authUserId)
        .order('created_at', { ascending: true })

      if (allProfiles && allProfiles.length > 0) {
        const buyer = allProfiles.find((p: any) => p.type === 'buyer')
        row = (buyer || allProfiles[0]) as ProfileRow
      }
    }

    if (!row) return json({ error: 'Profile not found' }, 404)

    // ---- ACTIONS ----

    if (action === 'get_handle') {
      return json({
        displayName: row.display_name ?? null,
        handle: row.handle ?? null,
        avatarUrl: row.avatar_url ?? null,
        type: row.type,
      })
    }

    if (action === 'set_display_name') {
      const displayName = parseDisplayName(body.displayName)
      if (!displayName) return json({ error: 'invalid_display_name' }, 400)

      // Check display_name uniqueness (exclude current profile) only for sellers
      if (row.type === 'creator' || row.type === 'school') {
        const taken = await isDisplayNameTaken(supabase, displayName, row.id)
        if (taken) {
          return json({ error: 'name_taken', message: 'Это название уже используется. Выберите другое.' }, 409)
        }
      }

      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', row.id)
        .select('display_name, handle')
        .single()

      if (error || !updated) {
        console.error('set_display_name error:', error)
        return json({ error: 'Failed to save display name' }, 500)
      }

      if (row.type === 'creator' || row.type === 'school') {
        await supabase
          .from('creator_accounts')
          .update({ display_name: displayName })
          .eq('profile_id', row.id)
      }

      return json({
        ok: true,
        displayName: updated.display_name,
        handle: updated.handle ?? null,
      })
    }

    if (action === 'set_avatar') {
      const avatarUrl = typeof body.avatarUrl === 'string' && body.avatarUrl.trim().length > 0
        ? body.avatarUrl.trim()
        : null
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', row.id)
      if (error) {
        console.error('set_avatar error:', error)
        return json({ error: 'Failed to save avatar' }, 500)
      }
      return json({ ok: true, avatarUrl })
    }

    if (action === 'clear_avatar') {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', row.id)
      if (error) {
        console.error('clear_avatar error:', error)
        return json({ error: 'Failed to remove avatar' }, 500)
      }
      return json({ ok: true, avatarUrl: null })
    }

    if (action === 'set_recovery_phone') {
      const rawPhone = typeof body.recoveryPhone === 'string' ? body.recoveryPhone : typeof body.phone === 'string' ? body.phone : ''
      const cleanPhoneVal = rawPhone.trim()
      if (row.type === 'creator' || row.type === 'school') {
        await supabase
          .from('creator_accounts')
          .update({ recovery_phone: cleanPhoneVal || null })
          .eq('profile_id', row.id)
      }
      return json({ ok: true, recoveryPhone: cleanPhoneVal })
    }

    if (action === 'delete_profile') {
      if (row.type !== 'creator' && row.type !== 'school') {
        return json({ error: 'Cannot delete buyer profile' }, 400)
      }

      // 0. Prepare next buyer session
      let nextSession: any = null
      const { data: buyerProf } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('auth_user_id', authUserId)
        .eq('type', 'buyer')
        .maybeSingle()

      if (buyerProf) {
        const issued = await issueAppSession(supabase, {
          profile: buyerProf as ProfileRow,
          account: null,
        })
        if (issued.ok) {
          nextSession = issued.session
        }
      }

      // 1. Find creator account for this profile
      const { data: creatorAcc } = await supabase
        .from('creator_accounts')
        .select('id, login')
        .eq('profile_id', row.id)
        .maybeSingle()

      if (creatorAcc) {
        const { data: prods } = await supabase
          .from('products')
          .select('id')
          .or(`creator_account_id.eq.${creatorAcc.id},creator_id.eq.${creatorAcc.login}`)

        if (prods && prods.length > 0) {
          const prodIds = prods.map((p: { id: string }) => p.id)
          await supabase.from('signup_tokens').delete().in('product_id', prodIds)
          await supabase.from('materials').delete().in('product_id', prodIds)
          await supabase.from('product_prices').delete().in('product_id', prodIds)
          await supabase.from('product_purchases').delete().in('product_id', prodIds)
          await supabase.from('products').delete().in('id', prodIds)
        }

        if (creatorAcc.login) {
          await supabase.from('announcements').delete().eq('creator_id', creatorAcc.login)
          await supabase.from('bookings').delete().eq('creator_id', creatorAcc.login)
          await supabase.from('lesson_schedule').delete().eq('creator_id', creatorAcc.login)
        }
        await supabase.from('creator_members').delete().eq('creator_account_id', creatorAcc.id)
        await supabase.from('creator_account_links').delete().eq('creator_account_id', creatorAcc.id)
        await supabase.from('creator_accounts').delete().eq('id', creatorAcc.id)
      }

      // 2. Delete sessions for this profile
      await supabase.from('creator_sessions').delete().eq('profile_id', row.id)

      // 3. Delete the profile row
      const { error: delErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', row.id)

      if (delErr) {
        console.error('delete_profile error:', delErr)
        return json({ error: 'Failed to delete profile: ' + delErr.message }, 500)
      }

      const remainingProfiles: ProfileRow[] = await listProfiles(supabase, authUserId)

      if (nextSession) {
        const mappedProfiles = remainingProfiles.map((p) => ({
          id: p.id,
          type: p.type,
          displayName: p.display_name || p.type,
          handle: p.handle ?? null,
          avatarUrl: p.avatar_url ?? null,
          isCurrent: p.id === nextSession.profileId,
          lastUsedAt: p.last_used_at ?? null,
        }))
        nextSession.profiles = mappedProfiles
      }

      return json({
        ok: true,
        deletedProfileId: row.id,
        session: nextSession,
        profiles: remainingProfiles,
      })
    }

    if (row.type !== 'creator' && row.type !== 'school') {
      return json({ error: 'Forbidden' }, 403)
    }

    const raw = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : ''
    if (!HANDLE_RE.test(raw)) {
      return json({ error: 'invalid_handle', available: false }, 400)
    }

    const { data: available, error: checkError } = await supabase.rpc('handle_is_available', {
      p_handle: raw,
      p_except_id: row.id,
    })
    if (checkError) {
      console.error('handle_is_available error:', checkError)
      return json({ error: 'Failed' }, 500)
    }

    if (action === 'check_handle') {
      return json({ available: available === true, handle: raw })
    }

    if (action === 'set_handle') {
      if (!available) return json({ error: 'handle_taken' }, 409)

      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ handle: raw })
        .eq('id', row.id)
        .select('display_name, handle')
        .single()

      if (error || !updated) {
        console.error('set_handle error:', error)
        return json({ error: 'Failed' }, 500)
      }

      return json({
        ok: true,
        displayName: updated.display_name,
        handle: updated.handle,
      })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (err) {
    console.error('manage-profile error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
