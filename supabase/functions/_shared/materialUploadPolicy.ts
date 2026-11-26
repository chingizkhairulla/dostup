export const MAX_MATERIAL_PROXY_BYTES = 20 * 1024 * 1024;

/** A relay may only retry an object underneath the already-authorized product prefix. */
export function materialRelayKey(path: string, prefix: string): string | null {
  const match = /^s3:\/\/[^/]+\/(.+)$/.exec(path);
  const key = match?.[1];
  if (!key || !key.startsWith(prefix) || key.split('/').some(part => part === '.' || part === '..')) return null;
  return key;
}
