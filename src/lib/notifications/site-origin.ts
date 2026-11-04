/** Absolute links with secrets must never be constructed from a request Host header. */
export function trustedEmailSiteOrigin(): string | null {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.username || url.password || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost'))) return null;
    return url.origin;
  } catch { return null; }
}
