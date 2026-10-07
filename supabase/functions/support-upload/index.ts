import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { presignChatVideo } from '../_shared/chatAttachments.ts'

// Multipart sibling of support-api: takes one file for a support thread and puts it in the
// private support-attachments bucket. It returns a storage path, never a public URL — the
// chat endpoints hand out short-lived signed URLs when they read the thread back.
// Videos instead get a presigned AWS S3 URL (JSON body, action "presign_video") and go
// straight from the browser to S3.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const MAX_BYTES = 50 * 1024 * 1024

const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'video/mp4', 'video/quicktime', 'video/webm',
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

const kindOf = (mime: string): 'image' | 'video' | 'file' =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const isJson = (req.headers.get('content-type') || '').includes('application/json')
    const body = isJson ? await req.json().catch(() => ({})) as Record<string, unknown> : null
    const form = isJson ? null : await req.formData()
    const field = (key: string) => String((body ? body[key] : form!.get(key)) || '')
    const file = form ? form.get('file') as File | null : null
    const userType = field('user_type')
    const userRef = field('user_ref').trim()
    const displayName = field('display_name')
    const presignVideo = body?.action === 'presign_video'

    if (!['creator', 'teacher', 'student'].includes(userType)) return json({ error: 'Bad user_type' }, 400)
    if (!userRef) return json({ error: 'Bad user_ref' }, 400)
    if (!presignVideo) {
      if (!file) return json({ error: 'No file' }, 400)
      if (file.size > MAX_BYTES) return json({ error: 'File too large' }, 413)
      const mime = file.type || 'application/octet-stream'
      if (!ALLOWED.has(mime)) return json({ error: `Unsupported type: ${mime}` }, 415)
    }

    // Same thread resolution as support-api, so the first file can open a thread.
    let { data: thread } = await supabase
      .from('support_threads')
      .select('id')
      .eq('user_type', userType)
      .eq('user_ref', userRef)
      .maybeSingle()
    if (!thread) {
      const { data: created, error } = await supabase
        .from('support_threads')
        .insert({ user_type: userType, user_ref: userRef, display_name: displayName || userRef })
        .select('id')
        .single()
      if (error) return json({ error: error.message }, 500)
      thread = created
    }

    if (presignVideo) {
      const result = await presignChatVideo('support', thread.id, field('file_name'), field('file_type'), Number(body?.file_size) || 0)
      if ('error' in result) return json({ error: result.error }, result.status)
      return json({ success: true, uploadUrl: result.uploadUrl, attachment: result.attachment })
    }

    const upload_file = file!
    const mime = upload_file.type || 'application/octet-stream'
    const ext = (upload_file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    const path = `${thread.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`

    const upload = await supabase.storage
      .from('support-attachments')
      .upload(path, new Uint8Array(await upload_file.arrayBuffer()), { contentType: mime, upsert: false })
    if (upload.error) {
      console.error('support attachment upload failed', upload.error)
      return json({ error: 'Upload failed' }, 500)
    }

    return json({
      success: true,
      attachment: { path, name: upload_file.name.slice(0, 200), size: upload_file.size, kind: kindOf(mime) },
    })
  } catch (e) {
    console.error('support-upload error', e)
    return json({ error: String(e) }, 500)
  }
})
