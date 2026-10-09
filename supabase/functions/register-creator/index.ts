import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hashPassword } from '../_shared/password.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

function normalizeRecoveryPhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null
  const trimmed = phone.trim()
  if (trimmed.length < 8 || trimmed.length > 32) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return trimmed
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { login, password, accountType, recoveryPhone } = await req.json()

    if (typeof login !== 'string' || login.trim().length < 2 || login.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid login' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (accountType !== 'course_creator' && accountType !== 'online_school') {
      return new Response(JSON.stringify({ error: 'Invalid account type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedPhone = normalizeRecoveryPhone(recoveryPhone)
    if (!normalizedPhone) {
      return new Response(JSON.stringify({ error: 'Invalid recovery phone' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const trimmedLogin = login.trim()

    const { data: existing } = await supabase
      .from('creator_accounts')
      .select('id')
      .ilike('login', trimmedLogin)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ error: 'login_taken' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const passwordHash = await hashPassword(password)

    const { data: created, error: insertError } = await supabase
      .from('creator_accounts')
      .insert({
        login: trimmedLogin,
        display_name: trimmedLogin,
        password_hash: passwordHash,
        account_type: accountType,
        recovery_phone: normalizedPhone,
      })
      .select()
      .single()

    if (insertError || !created) {
      if ((insertError as { code?: string } | null)?.code === '23505') {
        return new Response(JSON.stringify({ error: 'login_taken' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      console.error('Insert error:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to create account' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await supabase.from('creator_sessions').insert({
      token: sessionToken,
      creator_name: trimmedLogin,
      expires_at: expiresAt.toISOString(),
    })

    return new Response(JSON.stringify({
      success: true,
      token: sessionToken,
      creatorName: trimmedLogin,
      accountType,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('register-creator error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
