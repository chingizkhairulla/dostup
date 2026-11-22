/** Local video URL → its first frame as a small JPEG data URL, or null when the browser cannot draw it. */
const posters = new Map<string, Promise<string | null>>();
const KEEP = 30;
const MAX_SIDE = 320;

/**
 * A `<video>` pointed at a fresh blob URL often stays blank (Safari, iPhone), so the tile of a
 * video that is still uploading had no picture. Here the first frame is drawn once onto a canvas
 * and kept as an image. The same URL gives the same promise, so a tile that turns from
 * "uploading" into "ready" does not draw it twice.
 */
export function videoPoster(localUrl: string): Promise<string | null> {
  const known = posters.get(localUrl);
  if (known) return known;
  const made = drawFirstFrame(localUrl);
  posters.set(localUrl, made);
  for (const key of posters.keys()) {
    if (posters.size <= KEEP) break;
    posters.delete(key);
  }
  return made;
}

function drawFirstFrame(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (poster: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(poster);
    };
    const timer = setTimeout(() => finish(null), 10_000);

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.onloadeddata = () => {
      // A hair past zero: some files start on an empty (black) frame.
      const at = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.1, video.duration / 2) : 0;
      if (at > 0) video.currentTime = at;
      else draw();
    };
    video.onseeked = () => draw();
    video.onerror = () => finish(null);

    function draw() {
      const { videoWidth: w, videoHeight: h } = video;
      if (!w || !h) return finish(null);
      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      try {
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        finish(null);
      }
    }

    video.src = src;
    video.load();
  });
}
