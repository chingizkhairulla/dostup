import { json, optionsResponse } from '../_shared/http.ts'
import { resolveUser, serviceClient } from '../_shared/session.ts'
import { appBaseUrl, sendTransactionalEmail } from '../_shared/transactional-email.ts'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function fail(stage: string, code: string, message: string, status = 400) {
  console.error('submit-payment-receipt fail', { stage, code, message, status })
  return json({ ok: false, stage, code, message }, status)
}

function ok(body: Record<string, unknown>, status = 200) {
  return json({ ok: true, ...body }, status)
}

function detectContentMime(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 4) return null

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }

  // GIF: GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' }
  }

  // PDF: %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return { mime: 'application/pdf', ext: 'pdf' }
  }

  return null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface SimplePurchaseRecord {
  id: string
  product_id: string
  buyer_profile_id?: string | null
  simple_user_id?: string | null
  amount: number
  status: string
  payment_method_id?: string | null
  assigned_teacher_id?: string | null
  can_choose_teacher?: boolean | null
  created_at?: string
  [key: string]: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const supabase = serviceClient()

    let sessionToken = ''
    let productId = ''
    let purchaseId = ''
    let paymentMethodId = ''
    let assignedTeacherId = ''
    let canChooseTeacher = false
    let fileBytes: Uint8Array | null = null
    let providedFileName = ''

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      sessionToken = String(formData.get('sessionToken') || '')
      productId = String(formData.get('productId') || '')
      purchaseId = String(formData.get('purchaseId') || '')
      paymentMethodId = String(formData.get('paymentMethodId') || '')
      assignedTeacherId = String(formData.get('assignedTeacherId') || '')
      canChooseTeacher = formData.get('canChooseTeacher') === 'true'

      const file = formData.get('file') || formData.get('receipt')
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        fileBytes = new Uint8Array(await (file as File).arrayBuffer())
        providedFileName = (file as File).name || ''
      }
    } else {
      const body = await req.json().catch(() => ({}))
      sessionToken = String(body.sessionToken || '')
      productId = String(body.productId || '')
      purchaseId = String(body.purchaseId || '')
      paymentMethodId = String(body.paymentMethodId || '')
      assignedTeacherId = String(body.assignedTeacherId || '')
      canChooseTeacher = Boolean(body.canChooseTeacher)
      providedFileName = String(body.fileName || '')

      if (body.fileBase64 && typeof body.fileBase64 === 'string') {
        const raw = atob(body.fileBase64)
        fileBytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) {
          fileBytes[i] = raw.charCodeAt(i)
        }
      }
    }

    if (!sessionToken) {
      return fail('auth', 'UNAUTHORIZED', 'Войдите в аккаунт, чтобы прикрепить чек.', 401)
    }

    const user = await resolveUser(supabase, sessionToken)
    if (!user) {
      return fail('auth', 'UNAUTHORIZED', 'Сессия истекла. Войдите заново.', 401)
    }

    if (!fileBytes || fileBytes.length === 0) {
      return fail('file_validation', 'EMPTY_FILE', 'Прикрепите файл чека.', 400)
    }

    if (fileBytes.length > MAX_BYTES) {
      return fail('file_validation', 'FILE_TOO_LARGE', 'Файл слишком большой (максимум 10 МБ).', 413)
    }

    // Server-side validation of file type by actual content magic bytes
    const detected = detectContentMime(fileBytes)
    if (!detected) {
      return fail(
        'file_validation',
        'UNSUPPORTED_TYPE',
        'Недопустимый формат файла. Прикрепите изображение (JPEG, PNG, WEBP) или PDF.',
        400,
      )
    }

    let purchase: SimplePurchaseRecord | null = null

    // If purchaseId is supplied, lookup that specific purchase
    if (purchaseId) {
      const { data: p, error: pError } = await supabase
        .from('simple_purchases')
        .select('*')
        .eq('id', purchaseId)
        .maybeSingle()

      if (pError || !p) {
        return fail('purchase_lookup', 'PURCHASE_NOT_FOUND', 'Заказ не найден.', 404)
      }

      const ownerId = p.buyer_profile_id || p.simple_user_id
      if (ownerId !== user.userId) {
        return fail('authorization', 'FORBIDDEN', 'Заказ принадлежит другому пользователю.', 403)
      }

      if (p.status === 'completed') {
        return ok({
          already_completed: true,
          purchaseId: p.id,
          purchase_status: 'completed',
          verification_status: 'confirmed',
        })
      }

      purchase = p
      if (paymentMethodId && p.payment_method_id !== paymentMethodId) {
        await supabase
          .from('simple_purchases')
          .update({ payment_method_id: paymentMethodId })
          .eq('id', p.id)
      }
    } else {
      // Create purchase row only upon submitting receipt
      if (!productId) {
        return fail('input', 'MISSING_PRODUCT_ID', 'Не указан продукт.', 400)
      }

      const { data: prod } = await supabase
        .from('products')
        .select('id, title, price, is_active')
        .eq('id', productId)
        .maybeSingle()

      if (!prod || prod.is_active === false) {
        return fail('product', 'PRODUCT_INACTIVE', 'Продукт недоступен для покупки.', 404)
      }

      // Check if already has completed access
      const { data: existingCompleted } = await supabase
        .from('simple_purchases')
        .select('*')
        .eq('buyer_profile_id', user.userId)
        .eq('product_id', productId)
        .eq('status', 'completed')
        .maybeSingle()

      if (existingCompleted) {
        return ok({
          already_completed: true,
          purchaseId: existingCompleted.id,
          purchase_status: 'completed',
          verification_status: 'confirmed',
        })
      }

      // Check if existing pending purchase exists
      const { data: existingPending, error: pendingErr } = await supabase
        .from('simple_purchases')
        .select('*')
        .eq('buyer_profile_id', user.userId)
        .eq('product_id', productId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingErr) {
        console.error('Failed to query existing pending purchase:', {
          code: pendingErr.code,
          message: pendingErr.message,
          details: pendingErr.details,
        })
      }

      if (existingPending) {
        // If there is already an active pending submission awaiting seller verification
        const { data: activeSubmissions } = await supabase
          .from('payment_submissions')
          .select('id, verification_status')
          .eq('purchase_id', existingPending.id)
          .eq('verification_status', 'pending')
          .limit(1)

        if (activeSubmissions && activeSubmissions.length > 0) {
          return fail(
            'purchase',
            'ALREADY_SUBMITTED',
            'Вы уже отправили чек за этот продукт. Ожидайте подтверждения продавцом.',
            409,
          )
        }

        purchase = existingPending
        if (paymentMethodId && existingPending.payment_method_id !== paymentMethodId) {
          await supabase
            .from('simple_purchases')
            .update({ payment_method_id: paymentMethodId })
            .eq('id', existingPending.id)
        }
      } else {
        const newPurchaseId = crypto.randomUUID()
        const { data: created, error: createError } = await supabase
          .from('simple_purchases')
          .insert({
            id: newPurchaseId,
            buyer_profile_id: user.userId,
            product_id: productId,
            amount: Number(prod.price) || 0,
            status: 'pending',
            payment_method_id: paymentMethodId || null,
            assigned_teacher_id: assignedTeacherId || null,
            can_choose_teacher: canChooseTeacher || false,
          })
          .select()
          .single()

        if (createError || !created) {
          console.error('Failed to create purchase on receipt submission:', {
            code: createError?.code,
            message: createError?.message,
            details: createError?.details,
            hint: createError?.hint,
          })

          if (createError?.code === '23505') {
            return fail('db', 'PURCHASE_ALREADY_EXISTS', 'Вы уже отправили чек за этот продукт.', 409)
          }

          if (createError?.code === '23503') {
            return fail(
              'db',
              'FOREIGN_KEY_VIOLATION',
              'Не удалось привязать данные покупки (пользователь или продукт не найден).',
              400,
            )
          }

          return fail('db', 'CREATE_PURCHASE_FAILED', 'Не удалось создать запись о покупке.', 500)
        }

        purchase = created
      }
    }

    const submissionId = crypto.randomUUID()
    const receiptPath = `${user.userId}/${purchase.id}/${submissionId}.${detected.ext}`
    const fileSha = await sha256Hex(fileBytes)

    const upload = await supabase.storage
      .from('payment-receipts')
      .upload(receiptPath, fileBytes, {
        contentType: detected.mime,
        upsert: true,
      })

    if (upload.error) {
      console.error('receipt upload failed', upload.error)
      return fail('storage', 'UPLOAD_FAILED', 'Не удалось сохранить файл чека.', 500)
    }

    // Insert payment submission with pending status (no automatic verification)
    const submissionRow = {
      id: submissionId,
      purchase_id: purchase.id,
      buyer_id: user.userId,
      receipt_path: receiptPath,
      receipt_mime_type: detected.mime,
      receipt_sha256: fileSha,
      detected_amount: null,
      detected_currency: 'KZT',
      transaction_id: null,
      receipt_type: detected.ext === 'pdf' ? 'pdf' : 'image',
      parsed_metadata: {
        payment_method_id: paymentMethodId || purchase.payment_method_id || null,
        file_name: providedFileName,
      },
      verification_status: 'pending',
      rejection_reason: null,
      fingerprint: fileSha,
      decided_at: null,
      decided_by: null,
    }

    const { error: subError } = await supabase
      .from('payment_submissions')
      .insert(submissionRow)

    if (subError) {
      console.error('submission insert failed:', {
        code: subError.code,
        message: subError.message,
        details: subError.details,
        hint: subError.hint,
      })
      if (subError.code === '23505') {
        return fail('db', 'DUPLICATE_SUBMISSION', 'Вы уже отправили этот чек.', 409)
      }
      return fail('db', 'SUBMISSION_INSERT_FAILED', 'Не удалось сохранить информацию о чеке.', 500)
    }

    // Notify seller immediately via push & email (Prompt 3 requirement)
    try {
      const { data: prod } = await supabase
        .from('products')
        .select('id, title, creator_account_id, price')
        .eq('id', purchase.product_id)
        .maybeSingle()

      if (prod?.creator_account_id) {
        const { data: creator } = await supabase
          .from('creator_accounts')
          .select('id, login, email, profile_id')
          .eq('id', prod.creator_account_id)
          .maybeSingle()

        if (creator) {
          const sellerProfileId = creator.profile_id || ''
          const checkUrl = `${appBaseUrl()}/creator?tab=users&purchaseId=${purchase.id}${sellerProfileId ? `&profileId=${sellerProfileId}` : ''}`

          // 1. Send push to seller
          try {
            await supabase.functions.invoke('send-push-notification', {
              body: {
                userId: null,
                targetRole: 'creator',
                title: 'Новая покупка!',
                body: 'После проверки оплаты откройте доступ',
                data: {
                  type: 'new_purchase',
                  purchaseId: purchase.id,
                  sellerProfileId,
                  profileId: sellerProfileId,
                },
              },
            })
          } catch (pushErr) {
            console.error('Failed to send push to seller on receipt submission:', pushErr)
          }

          // 2. Send email to seller
          if (creator.email) {
            try {
              let buyerName = 'Покупатель'
              const { data: buyerProf } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', user.userId)
                .maybeSingle()
              if (buyerProf?.display_name) buyerName = buyerProf.display_name

              await sendTransactionalEmail({
                to: creator.email,
                subject: 'Новая покупка!',
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
                    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700;">Новая покупка!</h2>
                    <p style="font-size: 15px; line-height: 1.5; color: #374151; margin-bottom: 16px;">
                      После проверки оплаты откройте доступ.
                    </p>
                    <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0;">
                      <p style="margin: 4px 0; font-size: 14px;"><strong>Продукт:</strong> ${prod.title || 'Курс/Материал'}</p>
                      <p style="margin: 4px 0; font-size: 14px;"><strong>Покупатель:</strong> ${buyerName}</p>
                      <p style="margin: 4px 0; font-size: 14px;"><strong>Сумма:</strong> ${purchase.amount} ₸</p>
                    </div>
                    <div style="margin: 24px 0;">
                      <a href="${checkUrl}" style="display: inline-block; background: #FF6B00; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                        Открыть доступ
                      </a>
                    </div>
                    <p style="font-size: 13px; color: #6B7280; margin-top: 24px;">
                      Сверьте поступление в банковском приложении: чек легко подделать.
                    </p>
                  </div>
                `,
              })
            } catch (mailErr) {
              console.error('Failed to send email to seller on receipt submission:', mailErr)
            }
          }
        }
      }
    } catch (notifErr) {
      console.error('Seller notification error in submit-payment-receipt:', notifErr)
    }

    return ok({
      purchaseId: purchase.id,
      submissionId,
      purchaseStatus: 'pending',
      verificationStatus: 'pending',
      receiptPath,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Внутренняя ошибка сервера'
    console.error('submit-payment-receipt error', err)
    return fail('server', 'INTERNAL_ERROR', errorMsg, 500)
  }
})
