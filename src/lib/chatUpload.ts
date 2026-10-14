import { compressVideoIfNeeded } from "@/lib/videoCompressor";

export type ChatAttachmentKind = "image" | "video" | "file";

export interface ChatAttachment {
  path: string;
  name: string;
  size: number;
  kind: ChatAttachmentKind;
  /** Signed, short-lived; absent on rows that arrive straight from realtime. */
  url?: string | null;
}

export type PresignVideo = (meta: {
  file_name: string;
  file_type: string;
  file_size: number;
}) => Promise<{ uploadUrl: string; attachment: ChatAttachment }>;

/** Same cap as CHAT_VIDEO_MAX_BYTES on the server. */
export const CHAT_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

const VIDEO_TYPE_BY_EXT: Record<string, string> = {
  mov: "video/quicktime",
  qt: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
};
const SERVER_VIDEO_TYPES = new Set(Object.values(VIDEO_TYPE_BY_EXT));

/** Known video extensions, for files the browser hands over without a type (a .mov on some Windows set-ups). */
export const isVideoFileName = (name: string) => (name.split(".").pop()?.toLowerCase() ?? "") in VIDEO_TYPE_BY_EXT;

/** Why an upload failed, when the person can do something about it. */
export type UploadFailure = "too_large" | "unsupported" | "network";

export class ChatUploadError extends Error {
  constructor(readonly reason: UploadFailure, message: string) {
    super(message);
  }
}

class RetryableUploadError extends Error {}

/**
 * The server takes mp4, quicktime and webm. Safari calls a .m4v "video/x-m4v" and some
 * systems give a .mov no type at all, so the extension decides when the type is not one of those.
 */
function videoType(file: File): string | null {
  if (SERVER_VIDEO_TYPES.has(file.type)) return file.type;
  return VIDEO_TYPE_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** PUT straight to the presigned S3 URL, so the video never passes through our functions. */
function putToS3(url: string, file: File, type: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const message = `S3 upload failed (${xhr.status})`;
      reject(xhr.status >= 500 ? new RetryableUploadError(message) : new Error(message));
    });
    xhr.addEventListener("error", () => reject(new RetryableUploadError("Network error")));
    xhr.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.send(file);
  });
}

/** A phone that was locked mid-upload drops the connection; the next try waits until the page is back. */
function pageVisible(signal?: AbortSignal) {
  if (document.visibilityState === "visible" || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      if (document.visibilityState !== "visible" && !signal?.aborted) return;
      document.removeEventListener("visibilitychange", done);
      resolve();
    };
    document.addEventListener("visibilitychange", done);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Chat videos: a clip over 30 MB is compressed in the browser first, then uploaded directly
 * to AWS S3 through a presigned URL.
 */
export async function uploadChatVideo(file: File, presign: PresignVideo, signal?: AbortSignal): Promise<ChatAttachment> {
  const ready = await compressVideoIfNeeded(file, undefined, signal);
  const type = videoType(ready);
  if (!type) throw new ChatUploadError("unsupported", `Unsupported video type: ${ready.type || ready.name}`);
  if (ready.size > CHAT_VIDEO_MAX_BYTES) throw new ChatUploadError("too_large", `Video is ${ready.size} bytes`);

  let presigned: Awaited<ReturnType<PresignVideo>>;
  try {
    presigned = await presign({ file_name: ready.name, file_type: type, file_size: ready.size });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/too large/i.test(message)) throw new ChatUploadError("too_large", message);
    if (/unsupported type/i.test(message)) throw new ChatUploadError("unsupported", message);
    throw e;
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await putToS3(presigned.uploadUrl, ready, type, signal);
      return presigned.attachment;
    } catch (e) {
      if (!(e instanceof RetryableUploadError) || signal?.aborted) throw e;
      if (attempt >= 2) throw new ChatUploadError("network", e.message);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      await pageVisible(signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
  }
}
