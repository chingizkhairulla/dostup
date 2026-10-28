import { json, optionsResponse } from './http.ts'
import { authorizeUpload, presignPut } from './s3.ts'
import { serviceClient } from './session.ts'
import { materialRelayKey, MAX_MATERIAL_PROXY_BYTES } from './materialUploadPolicy.ts'

const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AVATAR_MAX_BYTES = 5 * 1024 * 1024

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  return ''
}

function avatarExt(fileName: string, fileType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase() || ''
  if (fromName === 'jpg' || fromName === 'jpeg' || fromName === 'png' || fromName === 'webp') {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (fileType === 'image/png') return 'png'
  if (fileType === 'image/webp') return 'webp'
  return 'jpg'
}

async function handleAvatarUpload(body: Record<string, unknown>, req?: Request): Promise<Response> {
  const token = asString(body.creatorToken) || asString(body.sessionToken) || asString(body.token)
  const supabase = serviceClient()

  let profileId = asString(body.profileId)

  if (token) {
    const { data: session } = await supabase
      .from('creator_sessions')
      .select('profile_id, creator_name')
      .eq('token', token)
      .maybeSingle()

    if (session) {
      if (session.profile_id) {
        profileId = profileId || session.profile_id
      } else if (typeof session.creator_name === 'string' && session.creator_name.startsWith('buyer:')) {
        profileId = profileId || session.creator_name.slice(6)
      } else if (session.creator_name) {
        const { data: acc } = await supabase
          .from('creator_accounts')
          .select('profile_id')
          .ilike('login', session.creator_name)
          .maybeSingle()
        if (acc?.profile_id) profileId = profileId || acc.profile_id
      }
    }
  }

  // Fallback to JWT if available
  if (!profileId && req) {
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    if (jwt && jwt !== anonKey) {
      try {
        const { data: { user } } = await supabase.auth.getUser(jwt)
        if (user?.id) {
          const { data: p } = await supabase
            .from('profiles')
            .select('id')
            .eq('auth_user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (p?.id) profileId = p.id
        }
      } catch {
        // ignore
      }
    }
  }

  if (!profileId) return json({ error: 'Unauthorized' }, 401)

  const file = body.file
  const fileName = asString(body.fileName) || (file instanceof File ? file.name : 'avatar.jpg')
  const fileType = asString(body.fileType) || (file instanceof File ? file.type : 'image/jpeg')
  if (!AVATAR_MIME.has(fileType)) return json({ error: 'Invalid image type' }, 400)
  if (file instanceof File && file.size > AVATAR_MAX_BYTES) {
    return json({ error: 'File too large' }, 400)
  }

  const ext = avatarExt(fileName, fileType)
  const objectPath = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${objectPath}`

  if (file instanceof File) {
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(objectPath, file, { contentType: fileType, upsert: false })
    if (uploadError) {
      console.error('avatar upload error', uploadError)
      return json({ error: 'Upload failed' }, 500)
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profileId)
    if (profileError) {
      console.error('avatar profile update error', profileError)
      return json({ error: 'Failed to save avatar' }, 500)
    }
    return json({
      path: objectPath,
      storagePath: objectPath,
      publicUrl,
    })
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('avatars')
    .createSignedUploadUrl(objectPath)
  if (signError || !signed?.signedUrl) {
    console.error('avatar sign error', signError)
    return json({ error: 'Server misconfiguration' }, 500)
  }
  return json({
    uploadUrl: signed.signedUrl,
    path: objectPath,
    storagePath: objectPath,
    publicUrl,
    contentType: fileType,
  })
}

export async function handlePresignedUpload(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse()

  try {
    const contentType = req.headers.get('content-type') || ''
    let body: Record<string, unknown>

    if (contentType.includes('multipart/form-data')) {
      const contentLength = Number(req.headers.get('content-length') || 0);
      if (contentLength > MAX_MATERIAL_PROXY_BYTES + 65536) return json({ error: 'Server relay supports files up to 20 MB' }, 413);
      const form = await req.formData()
      body = {
        productId: form.get('productId'),
        role: form.get('role') || 'creator',
        purpose: form.get('purpose'),
        fileName: (form.get('file') as File | null)?.name || form.get('fileName'),
        fileType: (form.get('file') as File | null)?.type || form.get('fileType'),
        creatorToken: form.get('creatorToken'),
        creatorName: form.get('creatorName'),
        sessionToken: form.get('sessionToken'),
        teacherId: form.get('teacherId'),
        file: form.get('file'),
        storagePath: form.get('storagePath'),
      }
    } else {
      body = await req.json()
    }

    const purpose = asString(body.purpose) || asString(body.role)
    if (purpose === 'avatar') {
      return handleAvatarUpload(body, req)
    }

    const auth = await authorizeUpload(body)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const fileName = String(body.fileName || 'file.bin')
    const productId = String(body.productId)
    const rawExt = fileName.split('.').pop() || ''
    const fileExt = /^[a-zA-Z0-9]{1,12}$/.test(rawExt) ? rawExt : 'bin'
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const prefix = auth.role === 'teacher' ? `teacher-${auth.teacherId}/${productId}/` : `${productId}/`;
    const retryPath = asString(body.storagePath);
    const retryKey = retryPath ? materialRelayKey(retryPath, prefix) : null;
    if (retryPath && !retryKey) return json({ error: 'Invalid upload path' }, 400);
    const s3Key = retryKey || (auth.role === 'teacher'
      ? `teacher-${auth.teacherId}/${productId}/${uniqueId}.${fileExt}`
      : `${productId}/${uniqueId}.${fileExt}`)

    const signed = await presignPut(s3Key)
    if (!signed) return json({ error: 'Server misconfiguration' }, 500)

    if (retryPath && signed.storagePath !== retryPath) return json({ error: 'Invalid upload bucket' }, 400);
    const file = body.file
    if (file instanceof File) {
      if (file.size > MAX_MATERIAL_PROXY_BYTES) return json({ error: 'Server relay supports files up to 20 MB' }, 413);
      const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      if (!put.ok) return json({ error: 'Upload failed' }, 500)
      return json({ path: signed.storagePath, uploadUrl: signed.uploadUrl, storagePath: signed.storagePath })
    }

    return json({
      uploadUrl: signed.uploadUrl,
      storagePath: signed.storagePath,
      contentType: String(body.fileType || 'application/octet-stream'),
    })
  } catch (e) {
    console.error('presigned-upload error', e)
    return json({ error: 'Internal server error' }, 500)
  }
}
