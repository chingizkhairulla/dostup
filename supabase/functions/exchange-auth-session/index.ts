import { json, optionsResponse } from '../_shared/http.ts'
import {
  displayNameFrom,
  isGoogleOAuthUser,
  issueAppSession,
  issueOnboardingSession,
  linkAccountsByEmail,
  listProfiles,
  needsDisplayNamePrompt,
  normalizeEmail,
  pickUsableProfile,
  publicProfiles,
} from '../_shared/profiles.ts'
import { serviceClient } from '../_shared/session.ts'

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function accessTokenFrom(req: Request, body: Record<string, unknown>): string {
  const fromBody = body.access_token
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim()
  return bearerToken(req)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const accessToken = accessTokenFrom(req, body)
    if (!accessToken) {
      return json({ success: false, error: 'Missing access token' }, 401)
    }

    const supabase = serviceClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
    const user = userData?.user
    if (userError || !user) {
      return json({ success: false, error: 'Invalid access token' }, 401)
    }

    const email = normalizeEmail(user.email)
    if (!email) {
      return json({ success: false, error: 'Email is required' }, 400)
    }

    const displayName = (() => {
      const custom = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 100) : ''
      if (custom.length >= 2) return custom
      if (isGoogleOAuthUser(user)) return displayNameFrom(user)
      return ''
    })()

    await linkAccountsByEmail(supabase, user.id, email)
    const profiles = await listProfiles(supabase, user.id)

    // No profiles yet: do not create a buyer silently. The client shows the
    // role picker and creates the first profile through create-profile.
    if (profiles.length === 0) {
      const onboarding = await issueOnboardingSession(supabase, user.id)
      if (!onboarding.ok) return onboarding.response
      return json({
        success: true,
        needsOnboarding: true,
        token: onboarding.token,
        creatorName: onboarding.creatorName,
        profiles: [],
        suggestedDisplayName: displayName,
      })
    }

    // Returning identities reopen the most recently used profile.
    const picked = await pickUsableProfile(supabase, { authUserId: user.id, email, profiles })
    if (!picked) {
      return json({ success: false, error: 'Account blocked' })
    }

    const issued = await issueAppSession(supabase, picked)
    if (!issued.ok) return issued.response

    return json({
      success: true,
      ...issued.session,
      profiles: publicProfiles(profiles),
      needsNamePrompt: needsDisplayNamePrompt(picked.profile.display_name || displayName, email),
    })
  } catch (error) {
    console.error('exchange-auth-session error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
