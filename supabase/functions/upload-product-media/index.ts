import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { presignPut } from '../_shared/s3.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const urlAction = url.searchParams.get('action') || ''
    const contentType = req.headers.get('content-type') || ''

    let productId = ''
    let creatorName = ''
    let creatorToken = ''
    let kind: 'image' | 'video' | 'file' = 'image'
    let fileName = ''
    let fileType = ''
    let file: File | null = null
    let action = urlAction || 'upload'

    if (urlAction === 'stream_s3' || req.headers.get('x-upload-mode') === 'stream_s3') {
      action = 'stream_s3'
      productId = url.searchParams.get('productId') || req.headers.get('x-product-id') || ''
      creatorName = url.searchParams.get('creatorName') || req.headers.get('x-creator-name') || ''
      creatorToken = url.searchParams.get('token') || req.headers.get('x-creator-token') || ''
      kind = (url.searchParams.get('kind') as any) || 'video'
      fileName = url.searchParams.get('fileName') || 'video.mp4'
      fileType = req.headers.get('content-type') || url.searchParams.get('fileType') || 'video/mp4'
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      file = formData.get('file') as File | null
      productId = String(formData.get('productId') || '')
      creatorName = String(formData.get('creatorName') || '')
      creatorToken = String(formData.get('creatorToken') || '')
      kind = (formData.get('kind') as any) || 'image'
      fileName = file?.name || ''
      fileType = file?.type || ''
      action = String(formData.get('action') || 'upload')
    } else {
      const body = await req.json().catch(() => ({}))
      action = String(body.action || 'get_upload_url')
      productId = String(body.productId || '')
      creatorName = String(body.creatorName || '')
      creatorToken = String(body.creatorToken || body.token || '')
      kind = (body.kind as any) || 'image'
      fileName = String(body.fileName || (kind === 'video' ? 'video.mp4' : 'cover.jpg'))
      fileType = String(body.fileType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'))
    }

    if (action === 'set_s3_cors') {
      const { setBucketCors } = await import('../_shared/s3.ts')
      const result = await setBucketCors()
      if (!result.ok) {
        return json({ error: `PutBucketCors failed (${result.status}): ${result.text}` }, 500)
      }
      return json({ success: true, message: 'CORS configured on S3 bucket' })
    }

    if (!creatorToken) {
      return json({ error: 'Unauthorized - missing session token' }, 401)
    }

    // Resolve creator session
    const { data: session } = await supabase
      .from('creator_sessions')
      .select('creator_name, profile_id')
      .eq('token', creatorToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!session) {
      return json({ error: 'Unauthorized - invalid session' }, 401)
    }

    let account: { id: string; login: string } | null = null
    if (session.profile_id) {
      const { data: acc } = await supabase
        .from('creator_accounts')
        .select('id, login')
        .eq('profile_id', session.profile_id)
        .maybeSingle()
      if (acc) account = acc
    }
    if (!account && (creatorName || session.creator_name)) {
      const nameToMatch = creatorName || session.creator_name
      const { data: acc } = await supabase
        .from('creator_accounts')
        .select('id, login')
        .ilike('login', nameToMatch)
        .maybeSingle()
      if (acc) account = acc
    }

    if (!account) {
      return json({ error: 'Unauthorized - creator account not found' }, 403)
    }

    if (productId) {
      const { data: product } = await supabase
        .from('products')
        .select('id, creator_account_id')
        .eq('id', productId)
        .maybeSingle()

      if (product && product.creator_account_id !== account.id) {
        return json({ error: 'Unauthorized - not product creator' }, 403)
      }
    }

    const fileExt = (fileName.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase()
    const safeExt = fileExt.replace(/[^a-z0-9]/g, '') || (kind === 'video' ? 'mp4' : 'jpg')
    const folder = productId || account.id

    // Для видео используем Amazon AWS S3
    if (kind === 'video') {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const s3Key = `product-media/${folder}/${kind}-${uniqueId}.${safeExt}`

      const s3Signed = await presignPut(s3Key, 7200)
      if (!s3Signed) {
        return json({ error: 'AWS S3 configuration missing' }, 500)
      }

      const publicStreamingUrl = `${supabaseUrl}/functions/v1/s3-redirect?path=${encodeURIComponent(s3Signed.storagePath)}`

      // Videos go from the browser straight to AWS S3 with a presigned PUT, so a big file
      // never passes through this function (the ?action=stream_s3 proxy stays for old clients).
      if (action === 'get_upload_url' && !file) {
        return json({
          success: true,
          uploadType: 's3',
          uploadUrl: s3Signed.uploadUrl,
          url: publicStreamingUrl,
          publicUrl: publicStreamingUrl,
          storagePath: s3Signed.storagePath,
          path: s3Key,
          contentType: fileType || 'video/mp4',
        })
      }

      if (action === 'stream_s3') {
        const contentLength = req.headers.get('content-length')
        const s3Headers: Record<string, string> = {
          'Content-Type': fileType || 'video/mp4',
        }
        if (contentLength) {
          s3Headers['Content-Length'] = contentLength
        }

        const putRes = await fetch(s3Signed.uploadUrl, {
          method: 'PUT',
          body: req.body,
          // @ts-ignore
          duplex: 'half',
          headers: s3Headers,
        })

        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => '')
          console.error('S3 stream upload error:', putRes.status, errText)
          return json({ error: `S3 upload failed (${putRes.status}): ${errText}` }, 500)
        }

        return json({
          success: true,
          uploadType: 's3',
          url: publicStreamingUrl,
          publicUrl: publicStreamingUrl,
          storagePath: s3Signed.storagePath,
          path: s3Key,
        })
      }

      if (file) {
        const put = await fetch(s3Signed.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || fileType || 'video/mp4',
          },
        })

        if (!put.ok) {
          console.error('S3 direct put error:', put.status, put.statusText)
          return json({ error: 'Failed to upload video to S3' }, 500)
        }

        return json({
          success: true,
          uploadType: 's3',
          url: publicStreamingUrl,
          publicUrl: publicStreamingUrl,
          storagePath: s3Signed.storagePath,
          path: s3Key,
        })
      }
    }

    const objectPath = `${folder}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-media/${objectPath}`

    // Action 1: Create signed upload URL for direct client upload (bypasses 10MB edge payload limit)
    if (action === 'get_upload_url' || !file) {
      const { data: signed, error: signError } = await supabase
        .storage
        .from('product-media')
        .createSignedUploadUrl(objectPath)

      if (signError || !signed?.signedUrl) {
        console.error('Signed upload URL error:', signError)
        return json({ error: 'Failed to create upload URL' }, 500)
      }

      return json({
        success: true,
        uploadUrl: signed.signedUrl,
        token: signed.token,
        publicUrl,
        path: objectPath,
        url: publicUrl,
        contentType: fileType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      })
    }

    // Action 2: Direct multipart upload (fallback)
    const { error: uploadError } = await supabase
      .storage
      .from('product-media')
      .upload(objectPath, file, { contentType: file.type || fileType, upsert: false })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return json({ error: 'Failed to upload file to storage' }, 500)
    }

    return json({
      success: true,
      url: publicUrl,
      publicUrl,
      path: objectPath,
    })
  } catch (error: any) {
    console.error('upload-product-media error:', error)
    return json({ error: error?.message || 'Internal server error' }, 500)
  }
})
