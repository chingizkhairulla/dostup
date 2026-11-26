import { S3RequestPresigner } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.620.0?target=deno'
import { HttpRequest } from 'https://esm.sh/@smithy/protocol-http@4.1.7?target=deno'
import { Sha256 } from 'https://esm.sh/@aws-crypto/sha256-browser@5.2.0?target=deno'
import { getSignedUrl } from 'https://deno.land/x/aws_s3_presign@2.2.1/mod.ts'
import { corsHeaders, json } from './http.ts'
import {
  creatorOwnsProduct,
  resolveCreator,
  resolveUser,
  serviceClient,
  studentHasPurchase,
  teacherAssignedToProduct,
} from './session.ts'

export function parseS3Path(path: string): { bucket: string; key: string } | null {
  if (!path.startsWith('s3://')) return null
  const withoutPrefix = path.substring(5)
  const slashIndex = withoutPrefix.indexOf('/')
  if (slashIndex < 0) return null
  return { bucket: withoutPrefix.substring(0, slashIndex), key: withoutPrefix.substring(slashIndex + 1) }
}

export function extractProductId(path: string): string | null {
  let relative = path
  if (relative.startsWith('s3://')) {
    const parsed = parseS3Path(relative)
    if (!parsed) return null
    relative = parsed.key
  }
  const parts = relative.split('/')
  if (parts[0]?.startsWith('teacher-')) return parts[1] || null
  return parts[0] || null
}

function awsConfig() {
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')!
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
  const bucket = Deno.env.get('AWS_S3_BUCKET')!
  const region = Deno.env.get('AWS_S3_REGION')!
  if (!accessKeyId || !secretAccessKey || !bucket || !region) return null
  return { accessKeyId, secretAccessKey, bucket, region }
}

function buildPresignedUrl(request: Pick<HttpRequest, 'protocol' | 'hostname' | 'path'> & { query?: HttpRequest['query'] }): string {
  const url = new URL(`${request.protocol}//${request.hostname}${request.path}`)
  if (request.query) {
    for (const [key, value] of Object.entries(request.query)) {
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)))
      else if (value !== undefined && value !== null) url.searchParams.append(key, String(value))
    }
  }
  return url.toString()
}

export async function presignPut(s3Key: string, expiresIn = 3600): Promise<{ uploadUrl: string; storagePath: string } | null> {
  const cfg = awsConfig()
  if (!cfg) return null
  const hostname = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`
  const encodedKey = s3Key.split('/').map((s) => encodeURIComponent(s)).join('/')
  const presigner = new S3RequestPresigner({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    sha256: Sha256,
  })
  const signedRequest = await presigner.presign(
    new HttpRequest({
      protocol: 'https:',
      method: 'PUT',
      hostname,
      path: `/${encodedKey}`,
      headers: { host: hostname },
    }),
    { expiresIn },
  )
  return {
    uploadUrl: buildPresignedUrl(signedRequest),
    storagePath: `s3://${cfg.bucket}/${s3Key}`,
  }
}

export async function setBucketCors(): Promise<{ ok: boolean; status: number; text: string }> {
  const cfg = awsConfig()
  if (!cfg) return { ok: false, status: 500, text: 'AWS config missing' }

  try {
    const { md5 } = await import('https://esm.sh/js-md5@0.8.3')
    const hostname = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`
    const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`

    const contentMd5 = md5.base64(corsXml)
    const presigner = new S3RequestPresigner({
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      sha256: Sha256,
    })

    const signedRequest = await presigner.presign(
      new HttpRequest({
        protocol: 'https:',
        method: 'PUT',
        hostname,
        path: '/',
        query: { cors: '' },
        headers: {
          host: hostname,
          'content-type': 'application/xml',
          'content-md5': contentMd5,
        },
      }),
      { expiresIn: 300 }
    )

    const url = buildPresignedUrl(signedRequest)
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/xml',
        'Content-MD5': contentMd5,
      },
      body: corsXml,
    })

    const text = await res.text()
    return { ok: res.ok, status: res.status, text: text || (res.ok ? 'CORS set successfully' : 'Put failed') }
  } catch (err: any) {
    console.error('setBucketCors error:', err)
    return { ok: false, status: 500, text: err?.message || 'Unknown error' }
  }
}

export function presignGet(bucket: string, s3Key: string, forceDownload = false, expiresIn = 3600): string {
  const cfg = awsConfig()!
  const signOptions: Record<string, unknown> = {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    bucket,
    key: '/' + s3Key,
    region: cfg.region,
    expiresIn,
  }
  if (forceDownload) {
    signOptions.queryParams = { 'response-content-disposition': 'attachment' }
  }
  return getSignedUrl(signOptions as Parameters<typeof getSignedUrl>[0])
}

export async function authorizeUpload(body: Record<string, unknown>): Promise<{ ok: true; role: 'creator' | 'teacher'; teacherId?: string } | { ok: false; status: number; error: string }> {
  const supabase = serviceClient()
  const role = body.role === 'teacher' ? 'teacher' : 'creator'
  const productId = String(body.productId || '')
  if (!productId) return { ok: false, status: 400, error: 'Missing productId' }

  if (role === 'creator') {
    const creator = await resolveCreator(supabase, String(body.creatorToken || ''), String(body.creatorName || ''))
    if (!creator) return { ok: false, status: 401, error: 'Invalid creator session' }
    if (!(await creatorOwnsProduct(supabase, creator.accountId, productId))) {
      return { ok: false, status: 403, error: 'Not the product creator' }
    }
    return { ok: true, role: 'creator' }
  }

  const user = await resolveUser(supabase, String(body.sessionToken || ''))
  if (!user || user.role !== 'teacher') return { ok: false, status: 401, error: 'Invalid teacher session' }
  if (!(await teacherAssignedToProduct(supabase, user.name, productId))) {
    return { ok: false, status: 403, error: 'Not assigned to this product' }
  }
  return { ok: true, role: 'teacher', teacherId: user.userId }
}

export async function authorizeDownload(opts: {
  path: string
  creatorToken?: string
  creatorName?: string
  sessionToken?: string
}): Promise<boolean> {
  const productId = extractProductId(opts.path)
  if (!productId) return false
  const supabase = serviceClient()

  if (opts.creatorToken && opts.creatorName) {
    const creator = await resolveCreator(supabase, opts.creatorToken, opts.creatorName)
    if (creator && (await creatorOwnsProduct(supabase, creator.accountId, productId))) return true
  }

  if (opts.sessionToken) {
    const user = await resolveUser(supabase, opts.sessionToken)
    if (!user) return false
    if (user.role === 'teacher' && (await teacherAssignedToProduct(supabase, user.name, productId))) return true
    if (await studentHasPurchase(supabase, user.userId, productId)) return true
  }
  return false
}

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  zip: 'application/zip',
}

export function mimeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || ''
  return MIME_MAP[ext] || 'application/octet-stream'
}

export { corsHeaders, json }
