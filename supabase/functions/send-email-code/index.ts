import { json, optionsResponse } from '../_shared/http.ts'
import {
  alreadyRegisteredMessage,
  parseAdminUsers,
  pickEmailOtp,
  type AuthUser,
} from '../_shared/email-otp.ts'
import { normalizeEmail } from '../_shared/profiles.ts'
import { serviceClient } from '../_shared/session.ts'
import { hasTransactionalEmail, sendTransactionalEmail } from '../_shared/transactional-email.ts'
import { email as emails, toLang, type Lang } from '../_shared/i18n.ts'

async function authHeaders(key: string): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  }
}

async function findUserByEmail(email: string, serviceKey: string): Promise<AuthUser | null> {
  const url = Deno.env.get('SUPABASE_URL')!
  const headers = await authHeaders(serviceKey)
  for (const query of [`email=${encodeURIComponent(email)}`, `filter=${encodeURIComponent(email)}`]) {
    const res = await fetch(`${url}/auth/v1/admin/users?${query}`, { headers })
    if (!res.ok) continue
    const body = await res.json().catch(() => ({}))
    const user = parseAdminUsers(body, email)
    if (user) return user
  }
  return null
}

function fromAdminUser(user: {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
} | null | undefined): AuthUser | null {
  if (!user?.id) return null
  return {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at ?? null,
  }
}

async function ensureConfirmedUser(
  supabase: ReturnType<typeof serviceClient>,
  email: string,
  serviceKey: string,
): Promise<AuthUser | null> {
  let user = await findUserByEmail(email, serviceKey)
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (error && !alreadyRegisteredMessage(error.message)) {
      throw new Error(error.message)
    }
    user = fromAdminUser(data.user) ?? await findUserByEmail(email, serviceKey)
  }

  if (user?.id && !user.email_confirmed_at) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true })
    if (error) throw new Error(error.message)
    user = fromAdminUser(data.user) ?? { ...user, email_confirmed_at: new Date().toISOString() }
  }

  return user
}

async function sendCodeViaResend(
  supabase: ReturnType<typeof serviceClient>,
  email: string,
  lang: Lang,
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) {
    console.error('generateLink error:', error)
    return false
  }
  const otp = pickEmailOtp(data)
  if (!otp) {
    console.error('generateLink missing email_otp')
    return false
  }
  return await sendTransactionalEmail({ to: email, ...emails.loginCode(otp, lang) })
}

async function sendCodeViaGoTrue(
  url: string,
  anonKey: string,
  email: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const otpRes = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: await authHeaders(anonKey),
    body: JSON.stringify({ email, create_user: false }),
  })
  const otpBody = await otpRes.json().catch(() => ({})) as Record<string, unknown>
  if (!otpRes.ok) {
    const error = [otpBody.msg, otpBody.error_description, otpBody.error]
      .find((value) => typeof value === 'string' && value) as string | undefined
    return { ok: false, status: otpRes.status, error: error || 'Failed to send code' }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '')
    // The language the person was using when they asked for the code; there is
    // no profile to read it from yet. (The GoTrue fallback below uses Supabase's
    // own email template, which this cannot reach.)
    const lang = toLang(body.language)
    if (!email || !email.includes('@')) {
      return json({ error: 'Invalid email' }, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = serviceClient()

    try {
      await ensureConfirmedUser(supabase, email, serviceKey)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Failed to prepare user' }, 400)
    }

    if (hasTransactionalEmail() && await sendCodeViaResend(supabase, email, lang)) {
      return json({ success: true })
    }

    const fallback = await sendCodeViaGoTrue(url, anonKey, email)
    if (!fallback.ok) {
      return json({ error: fallback.error }, fallback.status)
    }

    return json({ success: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to send code' }, 500)
  }
})
