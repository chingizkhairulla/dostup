import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseS3Path, presignGet, presignPut } from './s3.ts'

export type ChatAttachment = { path: string; name: string; size: number; kind: 'image' | 'video' | 'file' }

export const ATTACHMENT_LABEL: Record<ChatAttachment['kind'], string> = {
  image: 'Фото',
  video: 'Видео',
  file: 'Файл',
}

export const CHAT_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
/** Videos skip the storage bucket, so their cap is set here (the browser compresses above 30 MB). */
export const CHAT_VIDEO_MAX_BYTES = 500 * 1024 * 1024

/**
 * Attachments live either in a private Supabase bucket (photos, documents) or in AWS S3
 * (videos, uploaded straight from the browser). Either way the chat only ever gets a
 * short-lived signed URL.
 */
export async function withSignedAttachmentUrls<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  bucket: string,
  messages: T[],
): Promise<(T & { attachments: (ChatAttachment & { url: string | null })[] })[]> {
  const all = messages.flatMap((m) => (Array.isArray(m.attachments) ? (m.attachments as ChatAttachment[]) : []))
  const storagePaths = all.map((a) => a.path).filter((p) => !p.startsWith('s3://'))
  const urlByPath = new Map<string, string>()
  if (storagePaths.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(storagePaths, 3600)
    for (const row of data ?? []) if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl)
  }
  for (const a of all) {
    if (!a.path.startsWith('s3://')) continue
    const parsed = parseS3Path(a.path)
    if (!parsed) continue
    try {
      urlByPath.set(a.path, presignGet(parsed.bucket, parsed.key, false, 3600))
    } catch (e) {
      console.error('chat attachment presign failed', e)
    }
  }
  return messages.map((m) => ({
    ...m,
    attachments: Array.isArray(m.attachments)
      ? (m.attachments as ChatAttachment[]).map((a) => ({ ...a, url: urlByPath.get(a.path) ?? null }))
      : [],
  }))
}

/**
 * Accepts only files inside this thread's own folder — `<threadId>/…` in the bucket or
 * `s3://<bucket>/chat/<scope>/<threadId>/…` — so nobody can attach someone else's file.
 */
export function sanitizeChatAttachments(raw: unknown, threadId: string, scope: string): ChatAttachment[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.length > 10) return null
  const out: ChatAttachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { path, name, size, kind } = item as Record<string, unknown>
    if (typeof path !== 'string' || path.includes('..')) return null
    const inBucket = path.startsWith(threadId + '/')
    const s3 = parseS3Path(path)
    const inS3 = !!s3 && s3.key.startsWith(`chat/${scope}/${threadId}/`)
    if (!inBucket && !inS3) return null
    if (typeof name !== 'string' || !name.trim()) return null
    if (kind !== 'image' && kind !== 'video' && kind !== 'file') return null
    out.push({ path, name: name.slice(0, 200), size: Number(size) || 0, kind })
  }
  return out
}

/** Presigned PUT for a chat video that the browser uploads straight to S3. */
export async function presignChatVideo(
  scope: string,
  threadId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<{ error: string; status: number } | { uploadUrl: string; attachment: ChatAttachment }> {
  if (!CHAT_VIDEO_MIME.has(fileType)) return { error: `Unsupported type: ${fileType}`, status: 415 }
  if (!(fileSize > 0) || fileSize > CHAT_VIDEO_MAX_BYTES) return { error: 'File too large', status: 413 }
  const ext = (fileName.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'mp4'
  const signed = await presignPut(`chat/${scope}/${threadId}/${crypto.randomUUID()}.${ext}`, 7200)
  if (!signed) return { error: 'Server misconfiguration', status: 500 }
  return {
    uploadUrl: signed.uploadUrl,
    attachment: { path: signed.storagePath, name: fileName.slice(0, 200) || 'video.mp4', size: fileSize, kind: 'video' },
  }
}
