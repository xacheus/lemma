/**
 * Builds a clean wa.me link for guest communication, normalising local Zambian
 * mobile numbers (097…, 096…, 095…, 077…, 076…) to international 260… format.
 */
export function buildGuestWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const rawDigits = phone.replace(/[^0-9+]/g, '');
  const stripped = rawDigits.replace(/^\+/, '');
  if (stripped.length < 9) return null;

  const normalized = stripped.startsWith('260')
    ? stripped
    : stripped.startsWith('0') && stripped.length === 10
      ? `260${stripped.slice(1)}`
      : stripped.length === 9 && /^[79]/.test(stripped)
        ? `260${stripped}`
        : stripped;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
