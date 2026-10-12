import { email, type Lang } from './i18n.ts'

export type AuthUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

export function alreadyRegisteredMessage(message: string | null | undefined): boolean {
  const text = (message || '').toLowerCase()
  return (
    text.includes('already been registered') ||
    text.includes('already registered') ||
    text.includes('already exists') ||
    text.includes('user already')
  )
}

function emailMatches(userEmail: string | null | undefined, email: string): boolean {
  return (userEmail || '').toLowerCase() === email
}

function asAuthUser(value: unknown, email: string): AuthUser | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id) return null
  const userEmail = typeof row.email === 'string' ? row.email : null
  if (userEmail && !emailMatches(userEmail, email)) return null
  return {
    id: row.id,
    email: userEmail,
    email_confirmed_at: typeof row.email_confirmed_at === 'string' ? row.email_confirmed_at : null,
  }
}

export function parseAdminUsers(body: unknown, email: string): AuthUser | null {
  if (!body || typeof body !== 'object') return null
  const rec = body as Record<string, unknown>

  if (Array.isArray(rec.users)) {
    for (const row of rec.users) {
      const user = asAuthUser(row, email)
      if (user && emailMatches(user.email, email)) return user
    }
  }

  const nested = asAuthUser(rec.user, email)
  if (nested) return nested

  return asAuthUser(rec, email)
}

export function pickEmailOtp(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  const props = rec.properties && typeof rec.properties === 'object'
    ? rec.properties as Record<string, unknown>
    : rec
  const otp = props.email_otp ?? props.emailOtp
  if (typeof otp !== 'string') return null
  const trimmed = otp.trim()
  return /^\d{6}$/.test(trimmed) ? trimmed : null
}

/** The wording lives with the other server-side text in i18n.ts. */
export function loginCodeEmailHtml(otp: string, lang: Lang = 'ru'): string {
  return email.loginCode(otp, lang).html
}
