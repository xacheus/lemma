import { normalizeBusinessName, OFFICIAL_BRAND_NAME } from '../brand';

/** Server-side transactional email configuration. No default sender is assumed. */
export function getBrevoEmailConfig(): { apiKey: string; sender: { email: string; name: string } } | null {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from || /[\r\n]/.test(from)) return null;

  // Preserve the existing EMAIL_FROM convention: address alone or Name <address>.
  const named = from.match(/^([^<>]+)\s*<([^<>]+)>$/);
  const email = (named ? named[2] : from).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  const configuredName = process.env.EMAIL_FROM_NAME?.trim() || named?.[1]?.trim().replace(/^"|"$/g, '') || OFFICIAL_BRAND_NAME;
  const name = normalizeBusinessName(configuredName);
  if (/[\r\n]/.test(name)) return null;
  return { apiKey, sender: { email, name } };
}

export function isBrevoEmailConfigured(): boolean {
  return getBrevoEmailConfig() !== null;
}
