import { corsHeaders, json, optionsResponse } from '../_shared/http.ts'
import {
  resolveCreator,
  resolveUser,
  serviceClient,
  unauthorized,
  forbidden,
  creatorOwnsProduct,
} from '../_shared/session.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const supabase = serviceClient()

    let submissionId = ''
    let sessionToken = ''
    let creatorToken = ''
    let creatorName = ''
    let wantsBlob = false

    if (req.method === 'GET') {
      const url = new URL(req.url)
      submissionId = url.searchParams.get('submissionId') || ''
      sessionToken = url.searchParams.get('sessionToken') || ''
      creatorToken = url.searchParams.get('creatorToken') || ''
      creatorName = url.searchParams.get('creatorName') || ''
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
      submissionId = String(body.submissionId || '')
      sessionToken = String(body.sessionToken || '')
      creatorToken = String(body.creatorToken || '')
      creatorName = String(body.creatorName || '')
      wantsBlob = Boolean(body.wantsBlob)
    }

    if (!submissionId) return json({ error: 'Missing submissionId' }, 400)

    const { data: submission } = await supabase
      .from('payment_submissions')
      .select('id, purchase_id, buyer_id, receipt_path, receipt_mime_type')
      .eq('id', submissionId)
      .maybeSingle()

    if (!submission) return json({ error: 'Receipt submission not found' }, 404)

    const { data: purchase } = await supabase
      .from('simple_purchases')
      .select('id, product_id, buyer_profile_id, simple_user_id')
      .eq('id', submission.purchase_id)
      .maybeSingle()

    if (!purchase) return json({ error: 'Purchase not found' }, 404)

    let isAuthorized = false

    // 1. Check if caller is the seller of the product
    if (creatorToken && creatorName) {
      const creator = await resolveCreator(supabase, creatorToken, creatorName)
      if (creator && (await creatorOwnsProduct(supabase, creator.accountId, purchase.product_id))) {
        isAuthorized = true
      }
    }

    // 2. Check if caller is the buyer of the purchase
    if (!isAuthorized && sessionToken) {
      const user = await resolveUser(supabase, sessionToken)
      if (
        user &&
        (purchase.buyer_profile_id === user.userId ||
          purchase.simple_user_id === user.userId ||
          submission.buyer_id === user.userId)
      ) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return forbidden('Not authorized to access this receipt')
    }

    // Generate short-lived signed URL (1 hour, matching materials)
    const { data: signed, error: signError } = await supabase.storage
      .from('payment-receipts')
      .createSignedUrl(submission.receipt_path, 3600)

    if (signError || !signed?.signedUrl) {
      console.error('Error creating signed URL for receipt:', signError)
      return json({ error: 'Receipt unavailable' }, 404)
    }

    // If client specifically requests a direct download/blob stream:
    if (wantsBlob) {
      const { data: fileData, error: dlError } = await supabase.storage
        .from('payment-receipts')
        .download(submission.receipt_path)

      if (dlError || !fileData) return json({ error: 'Receipt file unavailable' }, 404)

      return new Response(fileData, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': submission.receipt_mime_type || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    // Return the short-lived signed URL
    return json({
      ok: true,
      url: signed.signedUrl,
      mimeType: submission.receipt_mime_type,
    })
  } catch (e: any) {
    console.error('payment-receipt error', e)
    return json({ error: 'Internal error', details: e?.message }, 500)
  }
})
