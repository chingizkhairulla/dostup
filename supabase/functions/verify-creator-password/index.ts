import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { constantTimeCompare, verifyPassword } from '../_shared/password.ts'
import { issueAppSession, listProfiles, profileForAccount, publicProfiles, type CreatorAccountRow } from '../_shared/profiles.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GENERIC_ERROR = 'Invalid credentials'
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp.slice(0, 64)
  return 'unknown'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const fail = () => new Response(
    JSON.stringify({ success: false, error: GENERIC_ERROR }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )

  try {
    const { password, creatorName } = await req.json()

    if (!password || !creatorName) {
      return fail()
    }

    if (typeof password !== 'string' || password.length > 200) {
      return fail()
    }

    if (typeof creatorName !== 'string' || creatorName.length > 200 || creatorName.trim().length < 2) {
      return fail()
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const trimmedName = creatorName.trim()
    const identifier = trimmedName.toLowerCase()
    const ip = clientIp(req)
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()

    const { count: recentFailures } = await supabase
      .from('auth_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .gte('created_at', windowStart)

    if ((recentFailures ?? 0) >= MAX_FAILURES) {
      return fail()
    }

    const { data: account } = await supabase
      .from('creator_accounts')
      .select('*')
      .ilike('login', trimmedName)
      .maybeSingle()

    let isValid = false
    let accountType: 'course_creator' | 'online_school' = 'course_creator'
    let resolvedName = trimmedName

    if (account) {
      if ((account as { is_blocked?: boolean }).is_blocked) {
        return new Response(
          JSON.stringify({ success: false, error: 'Account blocked' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      isValid = typeof account.password_hash === 'string' &&
        await verifyPassword(password, account.password_hash)
      accountType = account.account_type as 'course_creator' | 'online_school'
      resolvedName = account.login
    } else {
      const expectedPassword = Deno.env.get('CREATOR_PASSWORD_HASH')
      if (expectedPassword) {
        isValid = constantTimeCompare(password, expectedPassword)
      }
    }

    if (!isValid) {
      await supabase.from('auth_attempts').insert({ identifier, ip })
      return fail()
    }

    let profile = null
    if (account) {
      profile = await profileForAccount(supabase, account as CreatorAccountRow)
    }

    if (profile) {
      const issued = await issueAppSession(supabase, {
        profile,
        account: (account as CreatorAccountRow | null) ?? null,
      })
      if (!issued.ok) return issued.response
      const profiles = profile.auth_user_id
        ? publicProfiles(await listProfiles(supabase, profile.auth_user_id))
        : publicProfiles([profile])
      return new Response(
        JSON.stringify({ success: true, ...issued.session, profiles }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await supabase
      .from('creator_sessions')
      .delete()
      .eq('creator_name', resolvedName)
      .lt('expires_at', new Date().toISOString())

    const { error: insertError } = await supabase
      .from('creator_sessions')
      .insert({
        token: sessionToken,
        creator_name: resolvedName,
        expires_at: expiresAt.toISOString()
      })

    if (insertError) {
      console.error('Error creating session:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: sessionToken,
        creatorName: resolvedName,
        accountType,
        profileType: accountType === 'online_school' ? 'school' : 'creator',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error verifying creator password:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
