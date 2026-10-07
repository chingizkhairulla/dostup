// Announcement posts are stored as HTML: attachments first, then the text.
// The composer only produces plain text, so links can live only inside the text.

export type AnnouncementAttachment =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "file"; url: string; name: string; size?: number };

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const formatFileSize = (bytes?: number) => {
  if (bytes === undefined || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Punctuation right after a link usually ends the sentence, not the URL.
const TRAILING_PUNCTUATION = /[.,!?;:)\]}»"']+$/;

/** Escapes plain text, turns http(s)/www links into anchors and newlines into <br />. */
export function textToHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    if (!url || /^www\.?$/i.test(url)) continue;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out += escapeHtml(text.slice(last, start));
    out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    last = start + url.length;
  }
  out += escapeHtml(text.slice(last));
  return out.replace(/\r?\n/g, "<br />");
}

export function buildAnnouncementHtml(text: string, attachments: AnnouncementAttachment[]): string {
  const parts = attachments.map((a) => {
    if (a.kind === "image") return `<p><img src="${escapeHtml(a.url)}" alt="" style="max-width:100%" /></p>`;
    if (a.kind === "video") return `<p><video src="${escapeHtml(a.url)}" controls style="max-width:100%"></video></p>`;
    const size = a.size !== undefined ? ` (${formatFileSize(a.size)})` : "";
    const sizeAttr = a.size !== undefined ? ` data-size="${a.size}"` : "";
    return (
      `<p><a href="${escapeHtml(a.url)}" data-attachment="1" data-name="${escapeHtml(a.name)}"${sizeAttr} ` +
      `target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(a.name)}${escapeHtml(size)}</a></p>`
    );
  });
  const trimmed = text.trim();
  if (trimmed) parts.push(`<p>${textToHtml(trimmed)}</p>`);
  return parts.join("");
}
