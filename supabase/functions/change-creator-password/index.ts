import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const PBKDF2_ITERATIONS = 100000

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = new Uint8Array(b64ToBuf(parts[2]))
  const expected = parts[3]
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const actual = bufToB64(bits)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufToB64(salt.buffer)}$${bufToB64(bits)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { creatorName, currentPassword, newPassword } = await req.json()

    if (typeof creatorName !== 'string' || creatorName.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Invalid creator name' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid current password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid new password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: account } = await supabase
      .from('creator_accounts')
      .select('*')
      .ilike('login', creatorName.trim())
      .maybeSingle()

    if (!account) {
      return new Response(JSON.stringify({ error: 'legacy_account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!account.password_hash || typeof account.password_hash !== 'string') {
      return new Response(JSON.stringify({ error: 'wrong_password' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ok = await verifyPassword(currentPassword, account.password_hash)
    if (!ok) {
      return new Response(JSON.stringify({ error: 'wrong_password' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newHash = await hashPassword(newPassword)
    const { error: updateError } = await supabase
      .from('creator_accounts')
      .update({ password_hash: newHash })
      .eq('id', account.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update password' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('change-creator-password error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
