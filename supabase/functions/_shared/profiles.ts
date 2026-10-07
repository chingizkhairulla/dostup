import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json } from './http.ts'

export type ProfileType = 'buyer' | 'creator' | 'school'
export type AccountType = 'course_creator' | 'online_school'

export const PROFILE_COLUMNS =
  'id, auth_user_id, type, display_name, handle, avatar_url, last_used_at, created_at'

export type ProfileRow = {
  id: string
  auth_user_id: string | null
  type: ProfileType
  display_name: string | null
  handle: string | null
  avatar_url: string | null
  last_used_at: string | null
  created_at: string
}

export type CreatorAccountRow = {
  id: string
  login: string
  display_name: string
  account_type: string
  is_blocked: boolean | null
  email: string | null
  auth_user_id: string | null
  profile_id: string | null
}

export function parseProfileType(raw: unknown): ProfileType | null {
  if (raw === 'buyer' || raw === 'creator' || raw === 'school') return raw
  if (raw === 'online_school') return 'school'
  if (raw === 'course_creator') return 'creator'
  return null
}

export function accountTypeFor(profileType: ProfileType): AccountType | null {
  if (profileType === 'creator') return 'course_creator'
  if (profileType === 'school') return 'online_school'
  return null
}

export function profileTypeForAccount(accountType: string): ProfileType {
  return accountType === 'online_school' ? 'school' : 'creator'
}

export function sessionCreatorName(
  profileType: ProfileType,
  login: string | null | undefined,
  profileId: string,
): string {
  if (profileType === 'buyer' || !login) return `buyer:${profileId}`
  return login
}

export function parseOnboardingAuthUserId(creatorName: string | null | undefined): string | null {
  if (typeof creatorName !== 'string' || !creatorName.startsWith('onboarding:')) return null
  const id = creatorName.slice('onboarding:'.length).trim()
  return id.length > 0 ? id : null
}

export type CreatorSessionRow = {
  token: string
  creator_name: string
  profile_id: string | null
}

export async function resolveSessionProfileId(
  supabase: SupabaseClient,
  session: CreatorSessionRow,
  hintProfileId?: string | null,
): Promise<string | null> {
  let profileId = session.profile_id || hintProfileId?.trim() || null

  if (!profileId) {
    if (typeof session.creator_name === 'string' && session.creator_name.startsWith('buyer:')) {
      profileId = session.creator_name.slice(6) || null
    } else if (session.creator_name) {
      const { data: acc } = await supabase
        .from('creator_accounts')
        .select('profile_id, auth_user_id, display_name, account_type')
        .ilike('login', escapeIlike(session.creator_name))
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
  }

  if (profileId && profileId !== session.profile_id) {
    await supabase
      .from('creator_sessions')
      .update({ profile_id: profileId })
      .eq('token', session.token)
  }

  return profileId
}

export async function issueOnboardingSession(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<{ ok: true; token: string; creatorName: string } | { ok: false; response: Response }> {
  const creatorName = `onboarding:${authUserId}`
  const sessionToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await supabase
    .from('creator_sessions')
    .delete()
    .eq('creator_name', creatorName)
    .lt('expires_at', new Date().toISOString())

  const { error: insertError } = await supabase.from('creator_sessions').insert({
    token: sessionToken,
    creator_name: creatorName,
    expires_at: expiresAt.toISOString(),
    profile_id: null,
  })

  if (insertError) {
    console.error('Error creating onboarding session:', insertError)
    return { ok: false, response: json({ error: 'Failed to create session' }, 500) }
  }

  return { ok: true, token: sessionToken, creatorName }
}

export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function isDisplayNameTaken(
  supabase: SupabaseClient,
  displayName: string,
  excludeProfileId?: string | null,
): Promise<boolean> {
  const trimmed = displayName.trim()
  if (!trimmed) return false
  let query = supabase
    .from('profiles')
    .select('id')
    .in('type', ['creator', 'school'])
    .ilike('display_name', escapeIlike(trimmed))
    .limit(1)

  if (excludeProfileId) {
    query = query.neq('id', excludeProfileId)
  }

  const { data, error } = await query
  if (error) {
    console.error('isDisplayNameTaken error:', error)
    return false
  }
  return !!(data && data.length > 0)
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (!email.includes('@') || email.length < 3 || email.length > 254) return null
  return email
}

export function needsDisplayNamePrompt(
  displayName: string | null | undefined,
  email: string | null | undefined,
): boolean {
  const name = (displayName ?? '').trim()
  if (!name) return true
  const local = (email ?? '').split('@')[0]?.trim().toLowerCase()
  if (local && name.toLowerCase() === local) return true
  if (name.includes('@')) return true
  return /^[A-Za-z0-9._%+-]*\.[A-Za-z0-9._%+-]+$/.test(name)
}

export function isGoogleOAuthUser(user: {
  app_metadata?: Record<string, unknown>
  identities?: Array<{ provider?: string }>
}): boolean {
  if (user.app_metadata?.provider === 'google') return true
  return user.identities?.some((identity) => identity.provider === 'google') === true
}

export function displayNameFrom(user: {
  email?: string
  user_metadata?: Record<string, unknown>
}): string {
  const meta = user.user_metadata ?? {}
  for (const key of ['full_name', 'name', 'display_name']) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim().length >= 2) return value.trim().slice(0, 100)
  }
  const local = (user.email ?? '').split('@')[0]?.trim() ?? ''
  return (local || 'User').slice(0, 100)
}

function loginBaseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const withoutPlus = local.split('+')[0] ?? local
  const cleaned = withoutPlus
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
  return (cleaned || 'creator').slice(0, 80)
}

export async function uniqueLogin(
  supabase: SupabaseClient,
  base: string,
): Promise<string> {
  let candidate = base
  for (let n = 2; n < 1000; n++) {
    const { data } = await supabase
      .from('creator_accounts')
      .select('id')
      .ilike('login', escapeIlike(candidate))
      .maybeSingle()
    if (!data) return candidate
    candidate = `${base}${n}`
  }
  return `${base}${Date.now()}`
}

export async function listProfiles(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<ProfileRow[]> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', authUserId)
  return (data ?? []) as ProfileRow[]
}

async function findExistingProfile(
  supabase: SupabaseClient,
  authUserId: string,
  type: ProfileType,
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', authUserId)
    .eq('type', type)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as ProfileRow | null) ?? null
}

export async function findOrCreateProfile(
  supabase: SupabaseClient,
  authUserId: string,
  type: ProfileType,
  displayName: string,
): Promise<ProfileRow | null> {
  const existing = await findExistingProfile(supabase, authUserId, type)
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      type,
      display_name: displayName,
    })
    .select(PROFILE_COLUMNS)
    .single()

  if (!error && created) return created as ProfileRow

  if ((error as { code?: string } | null)?.code === '23505') {
    return findExistingProfile(supabase, authUserId, type)
  }

  console.error('findOrCreateProfile error:', error)
  return null
}

export async function createSellerProfile(
  supabase: SupabaseClient,
  authUserId: string,
  type: 'creator' | 'school',
  displayName: string,
): Promise<ProfileRow | null> {
  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      type,
      display_name: displayName,
      last_used_at: new Date().toISOString(),
    })
    .select(PROFILE_COLUMNS)
    .single()

  if (!error && created) return created as ProfileRow
  console.error('createSellerProfile error:', error)
  return null
}

/** Profiles ordered by last use (most recent first), then newest. */
export function profilesByRecency(profiles: ProfileRow[]): ProfileRow[] {
  return [...profiles].sort((a, b) => {
    const aTime = a.last_used_at ? Date.parse(a.last_used_at) : 0
    const bTime = b.last_used_at ? Date.parse(b.last_used_at) : 0
    if (bTime !== aTime) return bTime - aTime
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
}

/**
 * Most recently used profile that can actually be opened: seller profiles get
 * their creator_accounts row ensured, blocked sellers are skipped.
 */
export async function pickUsableProfile(
  supabase: SupabaseClient,
  args: {
    authUserId: string
    email: string
    profiles: ProfileRow[]
    excludeProfileId?: string | null
  },
): Promise<{ profile: ProfileRow; account: CreatorAccountRow | null } | null> {
  const candidates = profilesByRecency(args.profiles).filter((p) => p.id !== args.excludeProfileId)
  for (const profile of candidates) {
    const sellerType = accountTypeFor(profile.type)
    if (!sellerType) return { profile, account: null }
    const account = await ensureCreatorAccount(supabase, {
      authUserId: args.authUserId,
      email: args.email,
      displayName: profile.display_name || args.email.split('@')[0] || 'User',
      profile,
      accountType: sellerType,
    })
    if (account && !account.is_blocked) return { profile, account }
  }
  return null
}

export function pickProfile(
  profiles: ProfileRow[],
  requested: ProfileType | null,
): ProfileRow | null {
  if (requested) return profiles.find((p) => p.type === requested) ?? null
  if (!profiles.length) return null
  return [...profiles].sort((a, b) => {
    const aTime = a.last_used_at ? Date.parse(a.last_used_at) : 0
    const bTime = b.last_used_at ? Date.parse(b.last_used_at) : 0
    if (bTime !== aTime) return bTime - aTime
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })[0] ?? null
}

export async function touchProfile(supabase: SupabaseClient, profileId: string) {
  await supabase.from('profiles').update({ last_used_at: new Date().toISOString() }).eq('id', profileId)
}

export async function profileForAccount(
  supabase: SupabaseClient,
  account: CreatorAccountRow,
): Promise<ProfileRow | null> {
  if (account.profile_id) {
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', account.profile_id)
      .maybeSingle()
    if (data) return data as ProfileRow
  }

  const type = profileTypeForAccount(account.account_type)
  if (account.auth_user_id) {
    return findOrCreateProfile(
      supabase,
      account.auth_user_id,
      type,
      account.display_name || account.login,
    )
  }

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: null,
      type,
      display_name: account.display_name || account.login,
    })
    .select(PROFILE_COLUMNS)
    .single()

  if (error || !created) {
    console.error('profileForAccount insert error:', error)
    return null
  }

  await supabase.from('creator_accounts').update({ profile_id: created.id }).eq('id', account.id)
  return created as ProfileRow
}

export async function loadAccountForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<CreatorAccountRow | null> {
  const { data } = await supabase
    .from('creator_accounts')
    .select('id, login, display_name, account_type, is_blocked, email, auth_user_id, profile_id')
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data as CreatorAccountRow | null) ?? null
}

export async function ensureCreatorAccount(
  supabase: SupabaseClient,
  args: {
    authUserId: string
    email: string
    displayName: string
    profile: ProfileRow
    accountType: AccountType
  },
): Promise<CreatorAccountRow | null> {
  const existing = await loadAccountForProfile(supabase, args.profile.id)
  if (existing) {
    const patch: Record<string, unknown> = {}
    if (!existing.auth_user_id) patch.auth_user_id = args.authUserId
    if (!existing.email && args.email) patch.email = args.email
    if (Object.keys(patch).length) {
      await supabase.from('creator_accounts').update(patch).eq('id', existing.id)
    }
    if (existing.is_blocked) return existing
    return { ...existing, ...patch } as CreatorAccountRow
  }

  const baseLogin = args.email
    ? loginBaseFromEmail(args.email)
    : `${args.profile.type}_${args.authUserId.slice(0, 8)}`
  let login = await uniqueLogin(supabase, baseLogin)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('creator_accounts')
      .insert({
        login,
        display_name: args.displayName,
        password_hash: null,
        account_type: args.accountType,
        email: args.email || null,
        auth_user_id: args.authUserId,
        profile_id: args.profile.id,
      })
      .select('id, login, display_name, account_type, is_blocked, email, auth_user_id, profile_id')
      .single()

    if (!error && data) return data as CreatorAccountRow

    if ((error as { code?: string } | null)?.code !== '23505') {
      console.error('ensureCreatorAccount insert error:', error)
      return null
    }

    const raced = await loadAccountForProfile(supabase, args.profile.id)
    if (raced) return raced

    login = await uniqueLogin(supabase, `${baseLogin}${attempt + 2}`)
  }
  return null
}

export async function linkAccountsByEmail(
  supabase: SupabaseClient,
  authUserId: string,
  email: string,
): Promise<void> {
  const { data: byEmail } = await supabase
    .from('creator_accounts')
    .select('id, login, display_name, account_type, is_blocked, email, auth_user_id, profile_id')
    .ilike('email', escapeIlike(email))

  for (const raw of byEmail ?? []) {
    const account = raw as CreatorAccountRow
    if (account.auth_user_id && account.auth_user_id !== authUserId) continue
    if (!account.auth_user_id) {
      await supabase
        .from('creator_accounts')
        .update({ auth_user_id: authUserId, email })
        .eq('id', account.id)
    }
    // Legacy password-era profiles have no identity; attach them so the seller
    // sees their existing profile instead of the role picker.
    if (account.profile_id) {
      await supabase
        .from('profiles')
        .update({ auth_user_id: authUserId })
        .eq('id', account.profile_id)
        .is('auth_user_id', null)
    }
  }
}

export type IssuedSession = {
  token: string
  creatorName: string
  accountType: AccountType | null
  profileType: ProfileType
  profileId: string
  displayName: string
  handle: string | null
}

export async function issueAppSession(
  supabase: SupabaseClient,
  args: {
    profile: ProfileRow
    account: CreatorAccountRow | null
  },
): Promise<{ ok: true; session: IssuedSession } | { ok: false; response: Response }> {
  const profileType = args.profile.type
  if ((profileType === 'creator' || profileType === 'school') && args.account?.is_blocked) {
    return { ok: false, response: json({ success: false, error: 'Account blocked' }) }
  }

  const creatorName = sessionCreatorName(profileType, args.account?.login, args.profile.id)
  const sessionToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await supabase
    .from('creator_sessions')
    .delete()
    .eq('creator_name', creatorName)
    .lt('expires_at', new Date().toISOString())

  const { error: insertError } = await supabase.from('creator_sessions').insert({
    token: sessionToken,
    creator_name: creatorName,
    expires_at: expiresAt.toISOString(),
    profile_id: args.profile.id,
  })

  if (insertError) {
    console.error('Error creating session:', insertError)
    return { ok: false, response: json({ error: 'Failed to create session' }, 500) }
  }

  await touchProfile(supabase, args.profile.id)

  const accountType = args.account
    ? args.account.account_type === 'online_school'
      ? 'online_school'
      : 'course_creator'
    : null

  return {
    ok: true,
    session: {
      token: sessionToken,
      creatorName,
      accountType,
      profileType,
      profileId: args.profile.id,
      displayName: args.profile.display_name || args.account?.display_name || creatorName,
      handle: args.profile.handle ?? null,
    },
  }
}

export async function activateSessionProfile(
  supabase: SupabaseClient,
  token: string,
  profile: ProfileRow,
  account: CreatorAccountRow | null,
): Promise<{ ok: true; session: IssuedSession } | { ok: false; response: Response }> {
  const profileType = profile.type
  if ((profileType === 'creator' || profileType === 'school') && account?.is_blocked) {
    return { ok: false, response: json({ success: false, error: 'Account blocked' }) }
  }

  const creatorName = sessionCreatorName(profileType, account?.login, profile.id)
  const { error } = await supabase
    .from('creator_sessions')
    .update({
      profile_id: profile.id,
      creator_name: creatorName,
    })
    .eq('token', token)

  if (error) {
    console.error('activateSessionProfile error:', error)
    return { ok: false, response: json({ error: 'Failed to switch profile' }, 500) }
  }

  await touchProfile(supabase, profile.id)

  const accountType = account
    ? account.account_type === 'online_school'
      ? 'online_school'
      : 'course_creator'
    : null

  return {
    ok: true,
    session: {
      token,
      creatorName,
      accountType,
      profileType,
      profileId: profile.id,
      displayName: profile.display_name || account?.display_name || creatorName,
      handle: profile.handle ?? null,
    },
  }
}

export function publicProfiles(rows: ProfileRow[]) {
  return rows.map((p) => ({
    id: p.id,
    type: p.type,
    displayName: p.display_name,
    createdAt: p.created_at,
    avatarUrl: p.avatar_url,
  }))
}
