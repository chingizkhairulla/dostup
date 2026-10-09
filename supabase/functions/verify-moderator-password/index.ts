import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { login, password } = await req.json()
    if (typeof login !== 'string' || typeof password !== 'string' || password.length > 500) {
      return new Response(JSON.stringify({ success: false, error: 'Bad input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const expectedLogin = 'moderator'
    const expectedPassword = Deno.env.get('MODERATOR_PASSWORD') ?? ''
    if (!expectedPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Moderator not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const ok = constantTimeCompare(login.trim().toLowerCase(), expectedLogin) && constantTimeCompare(password, expectedPassword)
    if (!ok) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = crypto.randomUUID()
    const { error } = await supabase.from('moderator_sessions').insert({ token })
    if (error) {
      return new Response(JSON.stringify({ success: false, error: 'Session error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ success: true, token }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
