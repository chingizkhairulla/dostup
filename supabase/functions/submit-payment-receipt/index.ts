import { json, optionsResponse } from '../_shared/http.ts'
import { resolveUser, serviceClient } from '../_shared/session.ts'
import {
  completePurchase,
  latestSubmissionForPurchase,
  recordVerificationEvent,
} from '../_shared/purchase.ts'
import { parseReceipt, sha256Hex } from '../_shared/receipt-parse.ts'
import { buildFingerprint, verifyReceipt } from '../_shared/receipt-verify.ts'
import { DEFAULT_LANG, receiptErrors, toLang, type Lang, type ReceiptErrorKey } from '../_shared/i18n.ts'

const MAX_BYTES = 4_194_304
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

// `message` is shown to the user as-is (ReceiptUploadCard), so it is written in
// the language the upload form sent; `code` stays the stable thing to branch on.
function fail(
  stage: string,
  code: string,
  status: number,
  lang: Lang,
  key: ReceiptErrorKey = code as ReceiptErrorKey,
) {
  const message = receiptErrors[key][lang]
  console.error('submit-payment-receipt fail', { stage, code, message, status })
  return json({ ok: false, stage, code, message }, status)
}

function ok(body: Record<string, unknown>, status = 200) {
  return json({ ok: true, ...body }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  let lang: Lang = DEFAULT_LANG
  try {
    const supabase = serviceClient()
    const parsed = await readRequest(req)
    lang = parsed.lang
    if ('code' in parsed) {
      return fail(parsed.stage, parsed.code, parsed.status, lang)
    }

    const user = await resolveUser(supabase, parsed.sessionToken)
    if (!user) {
      return fail('authentication', 'UNAUTHORIZED', 401, lang)
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('simple_purchases')
      .select('*')
      .eq('id', parsed.purchaseId)
      .maybeSingle()

    if (purchaseError || !purchase) {
      return fail('purchase_lookup', 'PURCHASE_NOT_FOUND', 404, lang)
    }
    const ownerId = purchase.buyer_profile_id || purchase.simple_user_id
    if (ownerId !== user.userId) {
      return fail('authorization', 'FORBIDDEN', 403, lang)
    }

    if (purchase.status === 'completed') {
      const latest = await latestSubmissionForPurchase(supabase, purchase.id)
      return ok({
        verification_status: 'confirmed',
        purchase_status: 'completed',
        submission: latest,
        message: 'already_completed',
      })
    }
    if (purchase.status !== 'pending') {
      return fail('purchase_status', 'PURCHASE_NOT_PENDING', 409, lang)
    }

    const mime = normalizeMime(parsed.mimeType, parsed.fileName)
    if (!ALLOWED_MIME.has(mime)) {
      return fail('mime_validation', 'UNSUPPORTED_TYPE', 400, lang)
    }
    if (parsed.bytes.byteLength === 0) {
      return fail('file_validation', 'EMPTY_FILE', 400, lang)
    }
    if (parsed.bytes.byteLength > MAX_BYTES) {
      return fail('file_validation', 'FILE_TOO_LARGE', 413, lang)
    }

    const { data: product } = await supabase
      .from('products')
      .select('id, title, price, kaspi_phone, kaspi_link, creator_account_id')
      .eq('id', purchase.product_id)
      .maybeSingle()

    let sellerName: string | null = null
    if (product?.creator_account_id) {
      const { data: account } = await supabase
        .from('creator_accounts')
        .select('display_name')
        .eq('id', product.creator_account_id)
        .maybeSingle()
      sellerName = account?.display_name ?? null
    }

    const fileSha = await sha256Hex(parsed.bytes)

    let extracted
    try {
      extracted = await parseReceipt({ bytes: parsed.bytes, mimeType: mime })
    } catch (err) {
      console.error('parseReceipt threw', err)
      extracted = {
        amount: null,
        currency: null,
        transactionId: null,
        paidAt: null,
        phones: [] as string[],
        names: [] as string[],
        qrPayloads: [] as string[],
        rawText: '',
        receiptType: 'unreadable' as const,
        documentClass: 'unreadable' as const,
        sources: { amount: null, transactionId: null, paidAt: null },
        ai: { error: 'parse_threw' },
      }
    }

    console.log('receipt extracted', {
      mime,
      bytes: parsed.bytes.byteLength,
      amount: extracted.amount,
      currency: extracted.currency,
      txn: extracted.transactionId,
      paidAt: extracted.paidAt,
      phones: extracted.phones,
      sources: extracted.sources,
      qrCount: extracted.qrPayloads.length,
      receiptType: extracted.receiptType,
      documentClass: extracted.documentClass,
      ai: extracted.ai ? extracted.ai._source ?? true : false,
    })

    const fingerprint = buildFingerprint(extracted, fileSha)

    const { data: existingFp } = await supabase
      .from('payment_submissions')
      .select('id, purchase_id, verification_status')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })

    let existingTxn: { id: string; purchase_id: string; verification_status: string }[] = []
    if (extracted.transactionId) {
      const { data } = await supabase
        .from('payment_submissions')
        .select('id, purchase_id, verification_status')
        .eq('transaction_id', extracted.transactionId)
      existingTxn = data ?? []
    }

    const duplicate = [...(existingFp ?? []), ...existingTxn].some(
      (row) => row.purchase_id !== purchase.id && row.verification_status === 'confirmed',
    )
    const reuseId = (existingFp ?? []).find((row) => row.purchase_id === purchase.id)?.id ?? null

    const submissionId = reuseId || crypto.randomUUID()
    const ext = mime === 'application/pdf' ? 'pdf' : extFromMime(mime)
    const receiptPath = `${user.userId}/${purchase.id}/${submissionId}.${ext}`

    const upload = await supabase.storage.from('payment-receipts').upload(receiptPath, parsed.bytes, {
      contentType: mime,
      upsert: true,
    })
    if (upload.error) {
      console.error('receipt upload failed', upload.error)
      return fail('storage_upload', 'STORAGE_UPLOAD_FAILED', 500, lang)
    }

    const verified = await verifyReceipt({
      purchaseAmount: Number(purchase.amount),
      purchaseCreatedAt: purchase.created_at,
      expectedCurrency: 'KZT',
      kaspiPhone: product?.kaspi_phone ?? null,
      kaspiLink: product?.kaspi_link ?? null,
      sellerName,
      productTitle: product?.title ?? null,
      extracted,
      fingerprint,
      duplicate,
    })

    const parsedMetadata = jsonbSafe({
      phones: extracted.phones,
      names: extracted.names,
      qr_payloads: extracted.qrPayloads.map(redactQr),
      sources: extracted.sources,
      paid_at: extracted.paidAt,
      document_class: extracted.documentClass,
      expected_amount: Number(purchase.amount),
      ai: extracted.ai
        ? {
            used: true,
            source: extracted.ai._source ?? 'openai',
            isKaspiReceipt: extracted.ai.isKaspiReceipt ?? null,
            isKaspiPayQr: extracted.ai.isKaspiPayQr ?? null,
            documentClass: extracted.ai.documentClass ?? null,
            amount: extracted.ai.amount ?? null,
            error: extracted.ai.error ?? null,
            rawText: typeof extracted.ai.rawText === 'string' ? String(extracted.ai.rawText).slice(0, 200) : null,
          }
        : null,
      checks: verified.checks,
    })

    const row = {
      id: submissionId,
      purchase_id: purchase.id,
      buyer_id: user.userId,
      receipt_path: receiptPath,
      receipt_mime_type: mime,
      receipt_sha256: fileSha,
      detected_amount: extracted.amount,
      detected_currency: extracted.currency === 'KZT' || extracted.currency === 'USD' || extracted.currency === 'EUR' || extracted.currency === 'RUB'
        ? extracted.currency
        : null,
      transaction_id: extracted.transactionId,
      receipt_type: extracted.receiptType,
      parsed_metadata: parsedMetadata,
      verification_status: 'pending',
      rejection_reason: null as string | null,
      fingerprint,
      decided_at: null as string | null,
      decided_by: null as string | null,
    }

    if (reuseId) {
      const { error } = await supabase.from('payment_submissions').update(row).eq('id', reuseId)
      if (error) {
        console.error('submission update after upload failed', error)
        return fail('db_update', 'DB_UPDATE_FAILED', 500, lang, dbMessage(error.message))
      }
    } else {
      const { error } = await supabase.from('payment_submissions').insert(row)
      if (error) {
        if (error.code === '23505') {
          verified.decision = 'rejected'
          verified.rejectionReason = 'duplicate_receipt'
        } else {
          console.error('submission insert after upload failed', error)
          return fail('db_insert', 'DB_INSERT_FAILED', 500, lang, dbMessage(error.message))
        }
      }
    }

    let purchaseStatus = purchase.status
    let decision = verified.decision
    const decidedAt = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('payment_submissions')
      .update({
        verification_status: decision,
        rejection_reason: verified.rejectionReason,
        decided_at: decidedAt,
        decided_by: 'system',
        parsed_metadata: parsedMetadata,
      })
      .eq('id', submissionId)

    if (updateError?.code === '23505') {
      decision = 'rejected'
      verified.rejectionReason = 'duplicate_receipt'
      await supabase
        .from('payment_submissions')
        .update({
          verification_status: 'rejected',
          rejection_reason: 'duplicate_receipt',
          decided_at: decidedAt,
          decided_by: 'system',
        })
        .eq('id', submissionId)
    } else if (updateError) {
      console.error('submission status update failed', updateError)
      if (decision === 'confirmed') decision = 'manual_review'
    }

    if (decision === 'confirmed') {
      const completed = await completePurchase(supabase, purchase.id)
      if (completed.ok) {
        purchaseStatus = 'completed'
      } else {
        console.error('complete purchase failed', completed)
        decision = 'manual_review'
        verified.rejectionReason = null
        await supabase
          .from('payment_submissions')
          .update({
            verification_status: 'manual_review',
            rejection_reason: null,
            decided_at: decidedAt,
            decided_by: 'system',
          })
          .eq('id', submissionId)
      }
    }

    await recordVerificationEvent(supabase, {
      submissionId,
      purchaseId: purchase.id,
      actor: 'system',
      decision,
      checks: jsonbSafe({ checks: verified.checks, completeEnough: verified.completeEnough }) as Record<string, unknown>,
      notes: verified.rejectionReason,
    })

    const submission = await latestSubmissionForPurchase(supabase, purchase.id)
    return ok({
      verification_status: decision,
      purchase_status: purchaseStatus,
      rejection_reason: verified.rejectionReason,
      expected_amount: Number(purchase.amount),
      detected_amount: extracted.amount,
      submission,
    })
  } catch (e) {
    console.error('submit-payment-receipt error', e)
    return fail('unhandled', 'INTERNAL_ERROR', 500, lang)
  }
})

type ParsedOk = {
  lang: Lang
  sessionToken: string
  purchaseId: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

// No language is known until the form has been read, so the two failures
// before that point answer in the default one.
type ParsedErr = { lang: Lang; status: number; stage: string; code: ReceiptErrorKey }

async function readRequest(req: Request): Promise<ParsedOk | ParsedErr> {
  const contentType = req.headers.get('content-type') || ''
  let sessionToken = sessionTokenFromAuth(req)
  let purchaseId = ''
  let fileName = 'receipt'
  let mimeType = ''
  let bytes: Uint8Array | null = null
  let lang: Lang = DEFAULT_LANG

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      console.error('formData parse failed', err)
      return {
        lang,
        status: 400,
        stage: 'request_parse',
        code: 'MULTIPART_PARSE_FAILED',
      }
    }
    lang = toLang(form.get('language'))
    const file = form.get('file')
    if (!(file instanceof File)) {
      return { lang, status: 400, stage: 'request_parse', code: 'MISSING_FILE' }
    }
    sessionToken = sessionToken || String(form.get('sessionToken') || '')
    purchaseId = String(form.get('purchaseId') || '')
    fileName = file.name || String(form.get('fileName') || 'receipt')
    mimeType = file.type || String(form.get('mimeType') || '')
    bytes = new Uint8Array(await file.arrayBuffer())
  } else {
    return {
      lang,
      status: 415,
      stage: 'request_parse',
      code: 'UNSUPPORTED_CONTENT_TYPE',
    }
  }

  if (!sessionToken) {
    return { lang, status: 401, stage: 'authentication', code: 'MISSING_SESSION' }
  }
  if (!purchaseId) {
    return { lang, status: 400, stage: 'request_parse', code: 'MISSING_PURCHASE' }
  }
  if (!bytes) {
    return { lang, status: 400, stage: 'request_parse', code: 'MISSING_FILE' }
  }

  return { lang, sessionToken, purchaseId, fileName, mimeType, bytes }
}

function sessionTokenFromAuth(req: Request): string {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bearer)) {
    return bearer
  }
  const dedicated = (req.headers.get('x-dostup-session') || '').trim()
  if (dedicated) return dedicated
  return ''
}

function normalizeMime(mime: string, fileName: string): string {
  const lower = (mime || '').toLowerCase()
  if (ALLOWED_MIME.has(lower)) return lower === 'image/jpg' ? 'image/jpeg' : lower
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return lower
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'jpg'
}

function redactQr(payload: string): string {
  if (payload.length <= 80) return payload
  return `${payload.slice(0, 48)}…`
}

function dbMessage(raw: string): ReceiptErrorKey {
  if (/unicode escape/i.test(raw)) return 'DB_BAD_TEXT'
  return 'DB_SAVE_FAILED'
}

function jsonbSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(sanitize(value), jsonReplacer))
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'string') return stripJsonbUnsafe(value)
  return value
}

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') return stripJsonbUnsafe(value)
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitize(v)
    }
    return out
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value
}

function stripJsonbUnsafe(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code === 0) continue
    if (code >= 0xd800 && code <= 0xdfff) continue
    out += ch
  }
  return out
}
