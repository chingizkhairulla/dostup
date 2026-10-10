/** Cheap one-line preview for the chat list — the full post is parsed only when it opens. */
export const previewOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Chat-list id prefix for a personal chat with a buyer or seller. */
export const DIRECT_PREFIX = "dm:";
