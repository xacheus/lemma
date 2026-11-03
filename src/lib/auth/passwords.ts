import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Production credential hashing using Node `crypto.scryptSync` (memory-hard KDF)
 * with per-account 16-byte random salt and timing-safe digest comparison.
 * Retains read compatibility with legacy `sha256$...` seed hashes.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored) return false;
  const [scheme, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;

  if (scheme === 'scrypt') {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(digest, 'hex');
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  }

  // Backward compatibility for pre-existing sha256 seed records
  const candidateHex = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(candidateHex, 'hex'), Buffer.from(digest, 'hex'));
  } catch {
    return false;
  }
}

export const DEMO_PASSWORD = 'lemma2026';
