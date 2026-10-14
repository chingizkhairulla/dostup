/** Bigger files stream as usual: holding one whole in memory could crash a phone tab. */
const MAX_WHOLE_BYTES = 300 * 1024 * 1024;
/** The last few videos stay downloaded, so reopening one plays at once. */
const KEEP = 3;

/** Remote URL → local object URL, oldest first. */
const loaded = new Map<string, string>();

/** The local copy of a video downloaded earlier, if it is still kept. */
export function takeLoadedVideo(url: string): string | undefined {
  const local = loaded.get(url);
  if (local) {
    loaded.delete(url);
    loaded.set(url, local);
  }
  return local;
}

/**
 * Downloads the whole video and returns a local URL for it, so playback never stops to buffer.
 * `onProgress` gets 0–1, or null when the server does not say how big the file is. Throws when
 * the file cannot be read from the page (e.g. the storage sends no CORS headers) or is too big.
 */
export async function loadWholeVideo(
  url: string,
  onProgress: (fraction: number | null) => void,
  signal: AbortSignal,
): Promise<string> {
  const kept = takeLoadedVideo(url);
  if (kept) return kept;

  // no-store: a copy cached by the chat thumbnail may lack the CORS headers this read needs.
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Video download failed (${response.status})`);
  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  if (total > MAX_WHOLE_BYTES) {
    void reader.cancel();
    throw new Error("Video too large to load whole");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress(total ? 0 : null);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (received > MAX_WHOLE_BYTES) {
      void reader.cancel();
      throw new Error("Video too large to load whole");
    }
    if (total) onProgress(Math.min(received / total, 1));
  }

  const local = URL.createObjectURL(new Blob(chunks, { type: response.headers.get("Content-Type") || "video/mp4" }));
  loaded.set(url, local);
  for (const [oldUrl, oldLocal] of loaded) {
    if (loaded.size <= KEEP) break;
    loaded.delete(oldUrl);
    URL.revokeObjectURL(oldLocal);
  }
  return local;
}
