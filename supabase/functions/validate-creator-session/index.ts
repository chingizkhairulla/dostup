import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  findOrCreateProfile,
  issueAppSession,
  issueOnboardingSession,
  listProfiles,
  loadAccountForProfile,
  parseOnboardingAuthUserId,
  pickUsableProfile,
  PROFILE_COLUMNS,
  profileTypeForAccount,
  publicProfiles,
  type ProfileRow,
} from '../_shared/profiles.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: session, error } = await supabase
      .from('creator_sessions')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    // --- JWT fallback: if token not in DB, try Authorization header ---
    if (error || !session) {
      const authHeader = req.headers.get('authorization') || ''
      const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      let authUserId: string | null = null
      if (jwt) {
        try {
          const { data: { user } } = await supabase.auth.getUser(jwt)
          if (user?.id) authUserId = user.id
        } catch { /* JWT invalid */ }
      }
      if (!authUserId) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      // Re-establish session for user via JWT
      const { data: userData } = await supabase.auth.admin.getUserById(authUserId)
      const email: string | null = userData?.user?.email?.trim().toLowerCase() ?? null
      const allProfiles = await listProfiles(supabase, authUserId)
      if (allProfiles.length === 0) {
        // Identity without profiles: resume the role picker.
        const onboarding = await issueOnboardingSession(supabase, authUserId)
        return new Response(
          JSON.stringify(onboarding.ok
            ? {
                valid: true,
                needsOnboarding: true,
                creatorName: onboarding.creatorName,
                profiles: [],
                newToken: onboarding.token,
              }
            : { valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      // Same rule as login: reopen the most recently used profile.
      const picked = await pickUsableProfile(supabase, {
        authUserId,
        email: email ?? '',
        profiles: allProfiles,
      })
      const issued = picked ? await issueAppSession(supabase, picked) : null
      if (!picked || !issued?.ok) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const { profile, account } = picked

      return new Response(
        JSON.stringify({
          valid: true,
          profileId: profile.id,
          profileType: profile.type,
          displayName: profile.display_name ?? '',
          handle: profile.handle ?? null,
          email,
          creatorName: issued.session.creatorName,
          accountType: account?.account_type ?? null,
          createdAt: profile.created_at,
          profiles: publicProfiles(allProfiles),
          newToken: issued.session.token,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const onboardingAuthId = parseOnboardingAuthUserId(session.creator_name)
    if (onboardingAuthId) {
      return new Response(
        JSON.stringify({
          valid: true,
          needsOnboarding: true,
          creatorName: session.creator_name,
          profiles: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let profileId = session.profile_id
    if (!profileId) {
      if (typeof session.creator_name === 'string' && session.creator_name.startsWith('buyer:')) {
        profileId = session.creator_name.slice(6)
      } else if (session.creator_name) {
        const { data: acc } = await supabase
          .from('creator_accounts')
          .select('profile_id, auth_user_id, display_name, account_type')
          .ilike('login', session.creator_name)
          .maybeSingle()
        if (acc?.profile_id) {
          profileId = acc.profile_id
        } else if (acc?.auth_user_id) {
          const type = profileTypeForAccount(acc.account_type)
          const p = await findOrCreateProfile(
            supabase,
            acc.auth_user_id,
            type,
            acc.display_name || session.creator_name,
          )
          if (p) profileId = p.id
        }
      }
      if (profileId) {
        await supabase.from('creator_sessions').update({ profile_id: profileId }).eq('token', token)
      }
    }

    let profile: ProfileRow | null = null
    if (profileId) {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', profileId)
        .maybeSingle()
      profile = (data as ProfileRow | null) ?? null
    }

    const account = profile ? await loadAccountForProfile(supabase, profile.id) : null
    const profiles = profile?.auth_user_id
      ? publicProfiles(await listProfiles(supabase, profile.auth_user_id))
      : profile
        ? publicProfiles([profile])
        : []

    let email: string | null = null
    if (profile?.auth_user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(profile.auth_user_id)
      email = userData?.user?.email?.trim().toLowerCase() ?? null
    }

    return new Response(
      JSON.stringify({
        valid: true,
        profileId: profile?.id ?? null,
        profileType: profile?.type ?? null,
        displayName: profile?.display_name ?? session.creator_name,
        handle: profile?.handle ?? null,
        email,
        creatorName: session.creator_name,
        accountType: account?.account_type ?? null,
        createdAt: profile?.created_at ?? session.created_at,
        profiles,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Error validating session:', error)
    return new Response(
      JSON.stringify({ valid: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
