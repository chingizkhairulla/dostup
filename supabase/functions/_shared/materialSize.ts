export function materialResponseSize(response: Response): number | null {
  if (!response.ok) return null;
  const raw = response.status === 206
    ? response.headers.get('content-range')?.match(/^bytes\s+\d+-\d+\/(\d+)$/i)?.[1]
    : response.headers.get('content-length');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}
