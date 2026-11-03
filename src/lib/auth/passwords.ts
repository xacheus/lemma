import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Demo credential handling. Passwords are salted-SHA256 hashed; the salt is random
 * per account and stored with the hash. This is deliberately *not* a production
 * password scheme (no work factor) — see docs/DEMO-LIMITATIONS.md, which lists what
 * has to change before this ships to a real property.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(8).toString('hex');
  const digest = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `sha256$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored) return false;
  const [, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;
  const candidate = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(digest, 'hex'));
  } catch {
    return false;
  }
}

/** Shared demo password shown on the sign-in screen. */
export const DEMO_PASSWORD = 'lemma2026';
