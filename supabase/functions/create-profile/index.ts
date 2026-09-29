import { json, optionsResponse } from '../_shared/http.ts'
import {
  accountTypeFor,
  activateSessionProfile,
  displayNameFrom,
  ensureCreatorAccount,
  isDisplayNameTaken,
  isGoogleOAuthUser,
  listProfiles,
  normalizeEmail,
  parseOnboardingAuthUserId,
  parseProfileType,
  PROFILE_COLUMNS,
  publicProfiles,
  touchProfile,
  type CreatorAccountRow,
  type ProfileRow,
} from '../_shared/profiles.ts'
import { serviceClient } from '../_shared/session.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) return json({ success: false, error: 'Missing token' }, 401)

    const suppliedType = body.profileType ?? body.profile_type
    if (typeof suppliedType !== 'string' || !suppliedType.trim()) {
      return json({ error: 'profileType required' }, 400)
    }
    const profileType = parseProfileType(suppliedType)
    if (!profileType) return json({ error: 'profileType required' }, 400)

    const isSeller = profileType === 'creator' || profileType === 'school'
    const customName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : ''
    // Sellers need a public name; a buyer may start without one.
    if (isSeller && customName.length < 2) return json({ error: 'displayName required' }, 400)

    const supabase = serviceClient()
    const { data: session } = await supabase
      .from('creator_sessions')
      .select('token, creator_name, profile_id, expires_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!session) return json({ success: false, error: 'Invalid session' }, 401)

    const authUserId = parseOnboardingAuthUserId(session.creator_name)
    if (!authUserId) {
      return json({ success: false, error: 'onboarding_required' }, 403)
    }
    if (session.profile_id) {
      return json({ success: false, error: 'profile_already_set' }, 409)
    }

    // Only one buyer profile per identity (unique index); seller profiles may repeat.
    const existing = await listProfiles(supabase, authUserId)
    if (profileType === 'buyer' && existing.some((p) => p.type === 'buyer')) {
      return json({ success: false, error: 'profile_exists' }, 409)
    }

    if (isSeller && await isDisplayNameTaken(supabase, customName)) {
      return json({ success: false, error: 'name_taken', message: 'Это название уже используется. Выберите другое.' }, 409)
    }

    const { data: userData } = await supabase.auth.admin.getUserById(authUserId)
    const email = normalizeEmail(userData?.user?.email) || ''
    const buyerFallbackName = userData?.user && isGoogleOAuthUser(userData.user)
      ? displayNameFrom(userData.user)
      : ''

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: authUserId,
        type: profileType,
        display_name: customName || buyerFallbackName,
        last_used_at: new Date().toISOString(),
      })
      .select(PROFILE_COLUMNS)
      .single()

    if (insertError || !created) {
      console.error('create-profile insert error:', insertError)
      return json({ error: 'Failed to create profile' }, 500)
    }

    const profile = created as ProfileRow
    await touchProfile(supabase, profile.id)

    const displayName = profile.display_name || displayNameFrom(userData?.user ?? { email })

    let account: CreatorAccountRow | null = null
    const sellerType = accountTypeFor(profileType)
    if (sellerType) {
      account = await ensureCreatorAccount(supabase, {
        authUserId,
        email,
        displayName,
        profile,
        accountType: sellerType,
      })
      if (!account) return json({ error: 'Failed to create account' }, 500)
      if (account.is_blocked) {
        return json({ success: false, error: 'account_blocked' })
      }
    }

    const activated = await activateSessionProfile(supabase, token, profile, account)
    if (!activated.ok) return activated.response

    const profiles = await listProfiles(supabase, authUserId)
    return json({
      success: true,
      ...activated.session,
      profiles: publicProfiles(profiles),
    })
  } catch (error) {
    console.error('create-profile error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
