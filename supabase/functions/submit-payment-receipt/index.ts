import { json, optionsResponse } from '../_shared/http.ts'
import { resolveUser, serviceClient } from '../_shared/session.ts'
import { latestSubmissionForPurchase, recordVerificationEvent } from '../_shared/purchase.ts'

const MAX_BYTES = 4_194_304
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

function fail(stage: string, code: string, message: string, status = 400) {
  console.error('submit-payment-receipt fail', { stage, code, message, status })
  return json({ ok: false, stage, code, message }, status)
}

function ok(body: Record<string, unknown>, status = 200) {
  return json({ ok: true, ...body }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const supabase = serviceClient()
    const parsed = await readRequest(req)
    if ('error' in parsed) {
      return fail(parsed.stage, parsed.code, parsed.error, parsed.status)
    }

    const user = await resolveUser(supabase, parsed.sessionToken)
    if (!user) {
      return fail('authentication', 'UNAUTHORIZED', 'Войдите в аккаунт, чтобы загрузить чек.', 401)
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('simple_purchases')
      .select('*')
      .eq('id', parsed.purchaseId)
      .maybeSingle()

    if (purchaseError || !purchase) {
      return fail('purchase_lookup', 'PURCHASE_NOT_FOUND', 'Заказ не найден.', 404)
    }
    const ownerId = purchase.buyer_profile_id || purchase.simple_user_id
    if (ownerId !== user.userId) {
      return fail('authorization', 'FORBIDDEN', 'Этот заказ принадлежит другому пользователю.', 403)
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
      return fail('purchase_status', 'PURCHASE_NOT_PENDING', 'Этот заказ уже нельзя подтвердить чеком.', 409)
    }

    const mime = normalizeMime(parsed.mimeType, parsed.fileName)
    if (!ALLOWED_MIME.has(mime)) {
      return fail('mime_validation', 'UNSUPPORTED_TYPE', 'Нужен файл JPG, PNG, WEBP или PDF.', 400)
    }
    if (parsed.bytes.byteLength === 0) {
      return fail('file_validation', 'EMPTY_FILE', 'Файл пустой. Выберите другой чек.', 400)
    }
    if (parsed.bytes.byteLength > MAX_BYTES) {
      return fail('file_validation', 'FILE_TOO_LARGE', 'Файл слишком большой (макс. 4 МБ).', 413)
    }

    const { data: product } = await supabase
      .from('products')
      .select('id, title, creator_account_id')
      .eq('id', purchase.product_id)
      .maybeSingle()

    const fileSha = await sha256Hex(parsed.bytes)
    const fingerprint = `sha256:${fileSha}`

    // Тот же файл уже подтверждён для другой покупки — не принимаем повторно.
    const { data: existingFp } = await supabase
      .from('payment_submissions')
      .select('id, purchase_id, verification_status')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })

    const duplicate = (existingFp ?? []).some(
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
      return fail(
        'storage_upload',
        'STORAGE_UPLOAD_FAILED',
        'Не удалось сохранить файл чека. Попробуйте ещё раз.',
        500,
      )
    }

    // Автопроверки нет: чек ждёт подтверждения продавца.
    let decision: 'manual_review' | 'rejected' = duplicate ? 'rejected' : 'manual_review'
    let rejectionReason: string | null = duplicate ? 'duplicate_receipt' : null
    const decidedAt = new Date().toISOString()

    const row = {
      id: submissionId,
      purchase_id: purchase.id,
      buyer_id: user.userId,
      receipt_path: receiptPath,
      receipt_mime_type: mime,
      receipt_sha256: fileSha,
      detected_amount: null as number | null,
      detected_currency: null as string | null,
      transaction_id: null as string | null,
      receipt_type: 'unknown',
      parsed_metadata: { expected_amount: Number(purchase.amount), auto_check: false },
      verification_status: decision,
      rejection_reason: rejectionReason,
      fingerprint,
      decided_at: duplicate ? decidedAt : null,
      decided_by: duplicate ? 'system' : null,
    }

    if (reuseId) {
      const { error } = await supabase.from('payment_submissions').update(row).eq('id', reuseId)
      if (error) {
        console.error('submission update after upload failed', error)
        return fail('db_update', 'DB_UPDATE_FAILED', dbMessage(error.message), 500)
      }
    } else {
      const { error } = await supabase.from('payment_submissions').insert(row)
      if (error) {
        if (error.code === '23505') {
          decision = 'rejected'
          rejectionReason = 'duplicate_receipt'
        } else {
          console.error('submission insert after upload failed', error)
          return fail('db_insert', 'DB_INSERT_FAILED', dbMessage(error.message), 500)
        }
      }
    }

    await recordVerificationEvent(supabase, {
      submissionId,
      purchaseId: purchase.id,
      actor: 'system',
      decision,
      checks: { auto_check: false, duplicate },
      notes: rejectionReason,
    })

    if (decision === 'manual_review') {
      await notifySellerAboutReceipt(purchase.id, product?.title ?? null, Number(purchase.amount))
    }

    const submission = await latestSubmissionForPurchase(supabase, purchase.id)
    return ok({
      verification_status: decision,
      purchase_status: purchase.status,
      rejection_reason: rejectionReason,
      expected_amount: Number(purchase.amount),
      detected_amount: null,
      submission,
    })
  } catch (e) {
    console.error('submit-payment-receipt error', e)
    return fail('unhandled', 'INTERNAL_ERROR', 'Не удалось обработать чек. Попробуйте ещё раз.', 500)
  }
})

type ParsedOk = {
  sessionToken: string
  purchaseId: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

type ParsedErr = { error: string; status: number; stage: string; code: string }

async function readRequest(req: Request): Promise<ParsedOk | ParsedErr> {
  const contentType = req.headers.get('content-type') || ''
  let sessionToken = sessionTokenFromAuth(req)
  let purchaseId = ''
  let fileName = 'receipt'
  let mimeType = ''
  let bytes: Uint8Array | null = null

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      console.error('formData parse failed', err)
      return {
        error: 'Не удалось прочитать файл. Попробуйте другой формат.',
        status: 400,
        stage: 'request_parse',
        code: 'MULTIPART_PARSE_FAILED',
      }
    }
    const file = form.get('file')
    if (!(file instanceof File)) {
      return { error: 'Файл не выбран.', status: 400, stage: 'request_parse', code: 'MISSING_FILE' }
    }
    sessionToken = sessionToken || String(form.get('sessionToken') || '')
    purchaseId = String(form.get('purchaseId') || '')
    fileName = file.name || String(form.get('fileName') || 'receipt')
    mimeType = file.type || String(form.get('mimeType') || '')
    bytes = new Uint8Array(await file.arrayBuffer())
  } else {
    return {
      error: 'Нужно отправить файл как multipart/form-data.',
      status: 415,
      stage: 'request_parse',
      code: 'UNSUPPORTED_CONTENT_TYPE',
    }
  }

  if (!sessionToken) {
    return { error: 'Войдите в аккаунт, чтобы загрузить чек.', status: 401, stage: 'authentication', code: 'MISSING_SESSION' }
  }
  if (!purchaseId) {
    return { error: 'Не указан заказ.', status: 400, stage: 'request_parse', code: 'MISSING_PURCHASE' }
  }
  if (!bytes) {
    return { error: 'Файл не выбран.', status: 400, stage: 'request_parse', code: 'MISSING_FILE' }
  }

  return { sessionToken, purchaseId, fileName, mimeType, bytes }
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

function dbMessage(raw: string): string {
  if (/unicode escape/i.test(raw)) return 'Не удалось сохранить данные чека. Попробуйте другое фото.'
  return 'Не удалось сохранить запись о чеке. Попробуйте ещё раз.'
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Пуш продавцу: «Новая покупка!» — по клику открывается раздел «Пользователи». */
async function notifySellerAboutReceipt(purchaseId: string, productTitle: string | null, amount: number) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return
    const productPart = productTitle ? ` «${productTitle}»` : ''
    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        targetRole: 'creator',
        title: 'Новая покупка!',
        body: `После проверки оплаты, откройте доступ.${productPart} · ${amount}₸`,
        data: { type: 'payment', purchaseId },
      }),
    })
  } catch (err) {
    console.error('seller push failed', err)
  }
}
