export function normalizeGroupLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length > 2048) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z0-9-]+$/i.test(url.hostname) || url.username || url.password) return null
    return url.href
  } catch { return null }
}
