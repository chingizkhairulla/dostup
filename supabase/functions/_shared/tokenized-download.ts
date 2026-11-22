import { corsHeaders, json, optionsResponse } from './http.ts'
import { authorizeDownload, mimeForKey, parseS3Path, presignGet } from './s3.ts'
import { serviceClient } from './session.ts'
import { buyerCanOpenMaterial } from './subscription.ts'

async function consumeAccessToken(token: string): Promise<string | null> {
  const supabase = serviceClient()
  const { data } = await supabase
    .from('material_access_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('material_access_tokens').update({ used: true }).eq('id', data.id)
    return null
  }
  await supabase.from('material_access_tokens').update({ used: true }).eq('id', data.id)
  return data.file_path as string
}

async function proxyPath(path: string, asAttachment = false, req?: Request): Promise<Response> {
  if (path.startsWith('s3://')) {
    const parsed = parseS3Path(path)
    if (!parsed) return json({ error: 'Not an S3 path' }, 400)
    const url = presignGet(parsed.bucket, parsed.key, asAttachment, 300)
    const fetchHeaders: Record<string, string> = {}
    const range = req?.headers.get('range')
    if (range) {
      fetchHeaders['range'] = range
    }
    const s3Response = await fetch(url, { headers: fetchHeaders })
    if (!s3Response.ok && s3Response.status !== 206) return json({ error: 'File not found' }, s3Response.status)
    const fileName = decodeURIComponent(parsed.key.split('/').pop() || 'download')
    
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': s3Response.headers.get('content-type') || mimeForKey(parsed.key),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': asAttachment
        ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
        : 'inline',
    }
    const contentRange = s3Response.headers.get('content-range')
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange
    }
    const contentLength = s3Response.headers.get('content-length')
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    return new Response(s3Response.body, {
      status: s3Response.status,
      headers: responseHeaders,
    })
  }

  const supabase = serviceClient()
  const { data, error } = await supabase.storage.from('materials').download(path)
  if (error || !data) return json({ error: 'File not found' }, 404)
  return new Response(data, {
    headers: { ...corsHeaders, 'Content-Type': mimeForKey(path), 'Content-Disposition': 'inline' },
  })
}

export async function handleTokenizedDownload(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (req.method === 'GET' && token) {
      const path = await consumeAccessToken(token)
      if (!path) return json({ error: 'Invalid or expired token' }, 403)
      return proxyPath(path, false)
    }

    if (req.method === 'GET') {
      const path = url.searchParams.get('path') || ''
      const sessionToken = url.searchParams.get('sessionToken') || ''
      const creatorToken = url.searchParams.get('creatorToken') || ''
      const creatorName = url.searchParams.get('creatorName') || ''
      const download = url.searchParams.get('download')
      const isPublicMedia = path.includes('/product-media/') || path.includes('product-media')
      const ok = isPublicMedia || (await authorizeDownload({ path, sessionToken, creatorToken, creatorName }))
      if (!ok) {
        const role = url.searchParams.get('role')
        const userId = url.searchParams.get('userId')
        if (role === 'student' && userId && path.startsWith('s3://')) {
          const parsed = parseS3Path(path)!
          const parts = parsed.key.split('/')
          const productId = parts[0]?.startsWith('teacher-') ? parts[1] : parts[0]
          const supabase = serviceClient()
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle()
          const hasAccess = profile
            ? await buyerCanOpenMaterial(supabase, profile.id, productId, { path })
            : false
          if (!hasAccess) {
            const { data: purchase } = await supabase
              .from('simple_purchases')
              .select('id')
              .eq('simple_user_id', userId)
              .eq('product_id', productId)
              .eq('status', 'completed')
              .maybeSingle()
            if (!purchase) return new Response('Access denied', { status: 403 })
          }
        } else if (role !== 'creator' && role !== 'teacher') {
          return new Response('Access denied', { status: 403 })
        }
      }
      if (isPublicMedia || url.searchParams.get('proxy') === '1') {
        return proxyPath(path, false, req)
      }

      const parsed = parseS3Path(path)
      if (!parsed) return new Response('Not an S3 path', { status: 400 })
      const presigned = presignGet(parsed.bucket, parsed.key, !!download, isPublicMedia ? 86400 : 3600)
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: presigned,
          'Cache-Control': isPublicMedia ? 'public, max-age=3600' : 'no-cache',
        },
      })
    }

    const body = await req.json().catch(() => ({}))
    const path = String(body.path || '')
    const defaultProxy = url.pathname.includes('s3-download-proxy')
    const mode = body.mode === 'proxy' || (body.mode !== 'url' && defaultProxy) ? 'proxy' : 'url'
    const isPublicMedia = path.includes('/product-media/') || path.includes('product-media')
    const ok = isPublicMedia || (await authorizeDownload({
      path,
      sessionToken: String(body.sessionToken || ''),
      creatorToken: String(body.creatorToken || ''),
      creatorName: String(body.creatorName || ''),
    }))
    if (!ok) {
      if (body.role === 'student' && body.userId) {
        const parsed = parseS3Path(path)
        if (!parsed) return json({ error: 'Not an S3 path' }, 400)
        const parts = parsed.key.split('/')
        const productId = parts[0]?.startsWith('teacher-') ? parts[1] : parts[0]
        const supabase = serviceClient()
        const profileId = typeof body.userId === 'string' ? body.userId : ''
        const hasAccess = profileId
          ? await buyerCanOpenMaterial(supabase, profileId, productId, { path })
          : false
        if (!hasAccess) {
          const { data: purchase } = await supabase
            .from('simple_purchases')
            .select('id')
            .eq('simple_user_id', body.userId)
            .eq('product_id', productId)
            .eq('status', 'completed')
            .maybeSingle()
          if (!purchase) return json({ error: 'Access denied' }, 403)
        }
      } else if (body.role !== 'creator' && body.role !== 'teacher') {
        return json({ error: 'Access denied' }, 403)
      }
    }

    const parsed = parseS3Path(path)
    if (!parsed) return json({ error: 'Not an S3 path' }, 400)

    if (mode === 'proxy') return proxyPath(path, true)

    const signed = presignGet(parsed.bucket, parsed.key, !!body.download, 3600)
    return json({ url: signed })
  } catch (e) {
    console.error('tokenized-download error', e)
    return json({ error: 'Internal server error' }, 500)
  }
}
