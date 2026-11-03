import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { PermissionKey, StaffUser } from '../domain/types';
import { permissionsFor } from '../domain/permissions';
import { getDb } from '../db/store';

export const SESSION_COOKIE = 'lemma_session';
export const SESSION_MAX_AGE = 60 * 60 * 12; // a reception shift, then sign in again

function secret(): string {
  return process.env.LEMMA_SESSION_SECRET ?? 'lemma-heights-demo-session-secret';
}

function sign(userId: string): string {
  return createHmac('sha256', secret()).update(`${userId}.${SESSION_MAX_AGE}`).digest('hex').slice(0, 32);
}

export function sessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, signature] = token.split('.');
  if (!userId || !signature) return null;
  const expected = sign(userId);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
}

export interface Session {
  user: StaffUser;
  permissions: Set<PermissionKey>;
}

/** Reads the session cookie and resolves it against the staff register. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const userId = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = getDb().staff.find((s) => s.id === userId);
  if (!user || !user.active) return null;
  return { user, permissions: permissionsFor(user) };
}

export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
