import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json } from './http.ts'
import { buyerHasProductAccess } from './subscription.ts'

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export type CreatorAuth = {
  kind: 'creator'
  accountId: string
  login: string
}

export type UserAuth = {
  kind: 'user'
  userId: string
  name: string
  role: string | null
}

export type Caller = CreatorAuth | UserAuth

type Body = Record<string, unknown>

function str(body: Body, key: string): string {
  const v = body[key]
  return typeof v === 'string' ? v.trim() : ''
}

export async function resolveCreator(
  supabase: SupabaseClient,
  token: string,
  creatorName: string,
): Promise<CreatorAuth | null> {
  if (!token || !creatorName) return null
  const { data: session } = await supabase
    .from('creator_sessions')
    .select('creator_name')
    .eq('token', token)
    .eq('creator_name', creatorName)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!session) return null

  const { data: account } = await supabase
    .from('creator_accounts')
    .select('id, login')
    .ilike('login', creatorName)
    .maybeSingle()
  if (!account) return null

  return { kind: 'creator', accountId: account.id, login: account.login }
}

export async function resolveUser(
  supabase: SupabaseClient,
  token: string,
): Promise<UserAuth | null> {
  if (!token) return null
  const { data: session } = await supabase
    .from('creator_sessions')
    .select('profile_id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!session?.profile_id) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, type, display_name')
    .eq('id', session.profile_id)
    .maybeSingle()
  if (!profile) return null

  const name = profile.display_name || 'User'
  let role = profile.type === 'buyer' ? 'student' : profile.type

  const { data: teacherRow } = await supabase
    .from('product_teachers')
    .select('id')
    .ilike('teacher_name', name)
    .limit(1)
    .maybeSingle()
  if (teacherRow) {
    role = 'teacher'
  }

  return {
    kind: 'user',
    userId: profile.id,
    name,
    role,
  }
}

export async function resolveCaller(
  supabase: SupabaseClient,
  body: Body,
): Promise<Caller | null> {
  const creator = await resolveCreator(supabase, str(body, 'creatorToken'), str(body, 'creatorName'))
  if (creator) return creator
  const token = str(body, 'sessionToken') || str(body, 'token') || str(body, 'creatorToken')
  return resolveUser(supabase, token)
}

export function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401)
}

export function forbidden(): Response {
  return json({ error: 'Forbidden' }, 403)
}

export async function creatorOwnsProduct(
  supabase: SupabaseClient,
  accountId: string,
  productId: string,
): Promise<boolean> {
  const { data: product } = await supabase
    .from('products')
    .select('id, creator_account_id, creator_id')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return false
  if (product.creator_account_id === accountId) return true
  const { data: account } = await supabase
    .from('creator_accounts')
    .select('login')
    .eq('id', accountId)
    .maybeSingle()
  if (account && product.creator_id && product.creator_id.toLowerCase() === account.login.toLowerCase()) {
    return true
  }
  return false
}

export async function teacherAssignedToProduct(
  supabase: SupabaseClient,
  teacherName: string,
  productId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('product_teachers')
    .select('id')
    .eq('product_id', productId)
    .ilike('teacher_name', teacherName)
    .maybeSingle()
  return !!data
}

export async function studentHasPurchase(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
): Promise<boolean> {
  return buyerHasProductAccess(supabase, userId, productId)
}

export async function productIdForSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('schedules')
    .select('product_id')
    .eq('id', scheduleId)
    .maybeSingle()
  return data?.product_id ?? null
}

export async function assertCanManageProduct(
  supabase: SupabaseClient,
  caller: Caller,
  productId: string,
): Promise<boolean> {
  if (caller.kind === 'creator') {
    return creatorOwnsProduct(supabase, caller.accountId, productId)
  }
  if (caller.role === 'teacher') {
    return teacherAssignedToProduct(supabase, caller.name, productId)
  }
  return false
}

export async function creatorProductIds(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('creator_account_id', accountId)
  return (data ?? []).map((p) => p.id)
}

export const CATALOG_COLUMNS =
  'id, created_at, updated_at, creator_id, creator_account_id, title, headline, description, price, image_url, video_url, media, has_schedule, is_active, is_paused, paused_message, slug, telegram_link, group_link_label, faq, access_duration_days, category_id, subcategory_id, lesson_format, event_starts_at, capacity, billing_period, payment_type, recurring_interval, has_free_trial, trial_days, pricing_options, topic'

export const CHECKOUT_COLUMNS = CATALOG_COLUMNS
