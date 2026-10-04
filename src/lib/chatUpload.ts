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

class RetryableUploadError extends Error {}

/** PUT straight to the presigned S3 URL, so the video never passes through our functions. */
function putToS3(url: string, file: File, signal?: AbortSignal) {
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
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.send(file);
  });
}

/**
 * Chat videos: a clip over 30 MB is compressed in the browser first, then uploaded directly
 * to AWS S3 through a presigned URL.
 */
export async function uploadChatVideo(file: File, presign: PresignVideo, signal?: AbortSignal): Promise<ChatAttachment> {
  const ready = await compressVideoIfNeeded(file, undefined, signal);
  const type = ready.type || "video/mp4";
  const { uploadUrl, attachment } = await presign({ file_name: ready.name, file_type: type, file_size: ready.size });
  try {
    await putToS3(uploadUrl, ready, signal);
  } catch (e) {
    // A phone dropping off the network mid-upload gets one more try before the error shows.
    if (!(e instanceof RetryableUploadError) || signal?.aborted) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await putToS3(uploadUrl, ready, signal);
  }
  return attachment;
}
