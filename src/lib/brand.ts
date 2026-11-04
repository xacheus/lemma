/** Official public identity for the single-property Lemma Heights booking platform. */
export const OFFICIAL_BRAND_NAME = 'Lemma Heights Apartments';
export const OFFICIAL_BRAND_NAME_UPPER = 'LEMMA HEIGHTS APARTMENTS';
export const RESERVATIONS_SENDER_NAME = `${OFFICIAL_BRAND_NAME} Reservations`;

const LEGACY_BRAND_PREFIXES: [RegExp, string][] = [
  [/^Lemma Apartments(?=$|[\s:.,;·–—-])/i, OFFICIAL_BRAND_NAME],
  [/^Lemma Reservations(?=$|[\s:.,;·–—-])/i, RESERVATIONS_SENDER_NAME],
];

/**
 * Keep legacy property labels from leaking into headers, documents, or email. Custom
 * operator-provided names are left untouched; only retired brand labels are upgraded.
 */
export function normalizeBusinessName(value?: string | null): string {
  const name = value?.trim();
  if (!name) return OFFICIAL_BRAND_NAME;
  for (const [legacyPrefix, replacement] of LEGACY_BRAND_PREFIXES) {
    if (legacyPrefix.test(name)) return name.replace(legacyPrefix, replacement);
  }
  return name;
}
