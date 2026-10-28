import { json, optionsResponse } from '../_shared/http.ts'
import { resolveCaller, serviceClient, unauthorized, forbidden } from '../_shared/session.ts'
import {
  presignChatVideo,
  sanitizeChatAttachments,
  withSignedAttachmentUrls,
} from '../_shared/chatAttachments.ts'
import { directPurchaseActive } from '../_shared/directAccess.ts'

// Personal chats between a seller and the people who bought their products.
// The seller sees one chat per buyer (tagged with the products they bought and whether their
// access is still active); the buyer sees one chat per seller they bought from.

const BUCKET = 'direct-attachments'
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
])

type Supabase = ReturnType<typeof serviceClient>
type Side = 'creator' | 'buyer'
type Me = { side: Side; creatorAccountId?: string; buyerProfileId?: string }

type PurchaseRow = {
  product_id: string
  buyer_profile_id: string | null
  status: string
  is_trial: boolean | null
  trial_ends_at: string | null
  access_expires_at: string | null
}

async function whoAmI(supabase: Supabase, body: Record<string, unknown>): Promise<Me | null> {
  const caller = await resolveCaller(supabase, body)
  if (!caller) return null
  if (body.as === 'creator') {
    return caller.kind === 'creator' ? { side: 'creator', creatorAccountId: caller.accountId } : null
  }
  if (caller.kind !== 'user') return null
  const { data: profile } = await supabase.from('profiles').select('type').eq('id', caller.userId).maybeSingle()
  return profile?.type === 'buyer' ? { side: 'buyer', buyerProfileId: caller.userId } : null
}

/** Paid (or closed) purchases linking this seller and buyer; none means they may not chat. */
async function pairPurchases(supabase: Supabase, creatorAccountId: string, buyerProfileId: string) {
  const { data: products } = await supabase.from('products').select('id').eq('creator_account_id', creatorAccountId)
  const ids = (products ?? []).map((p: { id: string }) => p.id)
  if (!ids.length) return []
  const { data } = await supabase
    .from('simple_purchases')
    .select('product_id, buyer_profile_id, status, is_trial, trial_ends_at, access_expires_at')
    .eq('buyer_profile_id', buyerProfileId)
    .in('product_id', ids)
    .in('status', ['completed', 'revoked'])
  return (data ?? []) as PurchaseRow[]
}

const isRecurring = (product: { categories?: unknown } | undefined) => {
  const categories = product?.categories as { slug: string } | { slug: string }[] | undefined
  return (Array.isArray(categories) ? categories[0]?.slug : categories?.slug) === 'subscriptions'
}

async function findThread(supabase: Supabase, creatorAccountId: string, buyerProfileId: string) {
  const { data } = await supabase
    .from('direct_threads')
    .select('*')
    .eq('creator_account_id', creatorAccountId)
    .eq('buyer_profile_id', buyerProfileId)
    .maybeSingle()
  return data as Record<string, unknown> & { id: string; unread_for_creator: number; unread_for_buyer: number } | null
}

async function ensureThread(supabase: Supabase, creatorAccountId: string, buyerProfileId: string) {
  const existing = await findThread(supabase, creatorAccountId, buyerProfileId)
  if (existing) return existing
  const { data, error } = await supabase
    .from('direct_threads')
    .insert({ creator_account_id: creatorAccountId, buyer_profile_id: buyerProfileId })
    .select('*')
    .single()
  // Two first messages at once: the other insert won, read it back.
  if (error) return findThread(supabase, creatorAccountId, buyerProfileId)
  return data
}

/** Resolves the pair (seller account, buyer profile) for a request and checks they may talk. */
async function resolvePair(supabase: Supabase, me: Me, peerId: string) {
  if (!peerId) return null
  const creatorAccountId = me.side === 'creator' ? me.creatorAccountId! : peerId
  const buyerProfileId = me.side === 'buyer' ? me.buyerProfileId! : peerId
  const purchases = await pairPurchases(supabase, creatorAccountId, buyerProfileId)
  if (!purchases.length && !(await findThread(supabase, creatorAccountId, buyerProfileId))) return null
  return { creatorAccountId, buyerProfileId }
}

async function listForCreator(supabase: Supabase, creatorAccountId: string) {
  const { data: products } = await supabase
    .from('products')
    .select('id, title, categories(slug)')
    .eq('creator_account_id', creatorAccountId)
  const productIds = (products ?? []).map((p: { id: string }) => p.id)
  const { data: savedThreads } = await supabase.from('direct_threads').select('*').eq('creator_account_id', creatorAccountId)
  const { data: purchases } = productIds.length ? await supabase
    .from('simple_purchases')
    .select('product_id, buyer_profile_id, status, is_trial, trial_ends_at, access_expires_at')
    .in('product_id', productIds)
    .in('status', ['completed', 'revoked'])
    .not('buyer_profile_id', 'is', null)
    : { data: [] }
  const rows = (purchases ?? []) as PurchaseRow[]
  const buyerIds = [...new Set([...rows.map((r) => r.buyer_profile_id!), ...(savedThreads ?? []).map((t) => t.buyer_profile_id)])]
  if (!buyerIds.length) return []

  const [{ data: profiles }, { data: subs }, { data: threads }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', buyerIds),
    productIds.length ? supabase
      .from('subscriptions')
      .select('product_id, buyer_profile_id, status, current_period_end')
      .in('product_id', productIds)
      .in('buyer_profile_id', buyerIds)
    : Promise.resolve({ data: [] }),
    Promise.resolve({ data: savedThreads }),
  ])
  const subByKey = new Map(
    ((subs ?? []) as { product_id: string; buyer_profile_id: string; status: string; current_period_end: string }[])
      .map((s) => [`${s.product_id}:${s.buyer_profile_id}`, s]),
  )
  const threadByBuyer = new Map(((threads ?? []) as { buyer_profile_id: string }[]).map((t) => [t.buyer_profile_id, t]))
  const profileById = new Map(((profiles ?? []) as { id: string }[]).map((p) => [p.id, p]))

  return buyerIds.map((buyerId) => {
    const mine = rows.filter((r) => r.buyer_profile_id === buyerId)
    const active = mine.some((r) => directPurchaseActive(r, subByKey.get(`${r.product_id}:${buyerId}`), isRecurring(products?.find((p) => p.id === r.product_id))))
    const profile = profileById.get(buyerId) as { display_name?: string | null; avatar_url?: string | null } | undefined
    const thread = threadByBuyer.get(buyerId) as Record<string, unknown> | undefined
    return {
      peer_id: buyerId,
      name: profile?.display_name || 'Покупатель',
      avatar_url: profile?.avatar_url ?? null,
      product_ids: [...new Set(mine.map((r) => r.product_id))],
      active,
      last_message_at: thread?.last_message_at ?? null,
      last_message_preview: thread?.last_message_preview ?? null,
      unread: Number(thread?.unread_for_creator ?? 0),
    }
  })
}

async function listForBuyer(supabase: Supabase, buyerProfileId: string) {
  const { data: purchases } = await supabase
    .from('simple_purchases')
    .select('product_id, buyer_profile_id, status, is_trial, trial_ends_at, access_expires_at')
    .eq('buyer_profile_id', buyerProfileId)
    .in('status', ['completed', 'revoked'])
  const rows = (purchases ?? []) as PurchaseRow[]
  const productIds = [...new Set(rows.map((r) => r.product_id))]
  const [{ data: products }, { data: subs }, { data: threads }] = await Promise.all([
    productIds.length ? supabase.from('products').select('id, creator_account_id, categories(slug)').in('id', productIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase
      .from('subscriptions')
      .select('product_id, status, current_period_end')
      .eq('buyer_profile_id', buyerProfileId)
      .in('product_id', productIds) : Promise.resolve({ data: [] }),
    supabase.from('direct_threads').select('*').eq('buyer_profile_id', buyerProfileId),
  ])
  const creatorByProduct = new Map(
    ((products ?? []) as { id: string; creator_account_id: string | null }[]).map((p) => [p.id, p.creator_account_id]),
  )
  const subByProduct = new Map(
    ((subs ?? []) as { product_id: string; status: string; current_period_end: string }[]).map((s) => [s.product_id, s]),
  )
  const creatorIds = [...new Set([...creatorByProduct.values(), ...(threads ?? []).map((t) => t.creator_account_id)].filter(Boolean))] as string[]
  if (!creatorIds.length) return []
  const { data: accounts } = await supabase.from('creator_accounts').select('id, login, profile_id').in('id', creatorIds)
  const profileIds = ((accounts ?? []) as { profile_id: string | null }[]).map((a) => a.profile_id).filter(Boolean) as string[]
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', profileIds)
    : { data: [] }
  const profileById = new Map(((profiles ?? []) as { id: string }[]).map((p) => [p.id, p]))
  const threadByCreator = new Map(((threads ?? []) as { creator_account_id: string }[]).map((t) => [t.creator_account_id, t]))

  return ((accounts ?? []) as { id: string; login: string; profile_id: string | null }[]).map((account) => {
    const mine = rows.filter((r) => creatorByProduct.get(r.product_id) === account.id)
    const profile = (account.profile_id ? profileById.get(account.profile_id) : undefined) as
      | { display_name?: string | null; avatar_url?: string | null }
      | undefined
    const thread = threadByCreator.get(account.id) as Record<string, unknown> | undefined
    return {
      peer_id: account.id,
      name: profile?.display_name || account.login,
      avatar_url: profile?.avatar_url ?? null,
      product_ids: [...new Set(mine.map((r) => r.product_id))],
      active: mine.some((r) => directPurchaseActive(r, subByProduct.get(r.product_id), isRecurring(products?.find((p) => p.id === r.product_id)))),
      last_message_at: thread?.last_message_at ?? null,
      last_message_preview: thread?.last_message_preview ?? null,
      unread: Number(thread?.unread_for_buyer ?? 0),
    }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const supabase = serviceClient()
    const isMultipart = (req.headers.get('content-type') || '').includes('multipart/form-data')
    const form = isMultipart ? await req.formData() : null
    const body: Record<string, unknown> = form
      ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'))
      : await req.json().catch(() => ({}))
    const action = String(body.action || (form ? 'upload' : ''))

    const me = await whoAmI(supabase, body)
    if (!me) return unauthorized()

    if (action === 'list_contacts') {
      const contacts = me.side === 'creator'
        ? await listForCreator(supabase, me.creatorAccountId!)
        : await listForBuyer(supabase, me.buyerProfileId!)
      return json({ contacts })
    }

    const pair = await resolvePair(supabase, me, String(body.peerId || ''))
    if (!pair) return forbidden()

    if (action === 'get_thread') {
      const thread = await findThread(supabase, pair.creatorAccountId, pair.buyerProfileId)
      if (!thread) return json({ messages: [] })
      const { data: rows } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
      const messages = await withSignedAttachmentUrls(supabase, BUCKET, rows ?? [])
      // Legacy clients acknowledge on fetch; new clients acknowledge after rendering.
      if (body.markRead !== false) {
        const read = await supabase.rpc('mark_direct_messages_read', {
          p_thread: thread.id, p_side: me.side, p_ids: (rows ?? []).map((row) => row.id),
        })
        if (read.error) throw read.error
      }
      return json({ messages })
    }

    if (action === 'mark_read') {
      const ids = body.messageIds
      if (!Array.isArray(ids) || ids.length > 1000 || ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return json({ error: 'Bad message IDs' }, 400)
      const thread = await findThread(supabase, pair.creatorAccountId, pair.buyerProfileId)
      if (!thread) return json({ ok: true })
      const read = await supabase.rpc('mark_direct_messages_read', { p_thread: thread.id, p_side: me.side, p_ids: ids })
      if (read.error) throw read.error
      return json({ ok: true })
    }

    if (action === 'upload' || action === 'presign_video') {
      const thread = await ensureThread(supabase, pair.creatorAccountId, pair.buyerProfileId)
      if (!thread) return json({ error: 'Thread unavailable' }, 500)

      if (action === 'presign_video') {
        const result = await presignChatVideo(
          'direct',
          thread.id,
          String(body.file_name || ''),
          String(body.file_type || ''),
          Number(body.file_size) || 0,
        )
        if ('error' in result) return json({ error: result.error }, result.status)
        return json({ uploadUrl: result.uploadUrl, attachment: result.attachment })
      }

      const file = form?.get('file')
      if (!(file instanceof File)) return json({ error: 'No file' }, 400)
      if (file.size > MAX_BYTES) return json({ error: 'File too large' }, 413)
      const mime = file.type || 'application/octet-stream'
      if (!ALLOWED.has(mime)) return json({ error: `Unsupported type: ${mime}` }, 415)
      const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
      const path = `${thread.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: mime, upsert: false })
      if (upload.error) {
        console.error('direct attachment upload failed', upload.error)
        return json({ error: 'Upload failed' }, 500)
      }
      return json({
        attachment: {
          path,
          name: file.name.slice(0, 200),
          size: file.size,
          kind: mime.startsWith('image/') ? 'image' : 'file',
        },
      })
    }

    if (action === 'send_message') {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length > 4000) return json({ error: 'Bad text' }, 400)
      const thread = await ensureThread(supabase, pair.creatorAccountId, pair.buyerProfileId)
      if (!thread) return json({ error: 'Thread unavailable' }, 500)
      const files = sanitizeChatAttachments(body.attachments, thread.id, 'direct')
      if (files === null) return json({ error: 'Bad attachments' }, 400)
      if (!text && !files.length) return json({ error: 'Empty message' }, 400)

      const { data: message, error } = await supabase
        .from('direct_messages')
        .insert({ thread_id: thread.id, sender: me.side, text, attachments: files })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 500)

      // The insert trigger updates the preview and unread counter atomically.
      return json({ message })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('direct-messages error', e)
    return json({ error: 'Internal error' }, 500)
  }
})
