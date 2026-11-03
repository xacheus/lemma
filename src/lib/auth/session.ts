import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { PermissionKey, StaffUser, UserRecord } from '../domain/types';
import { permissionsFor } from '../domain/permissions';
import { ensureCloudFirestoreHydrated, getDb } from '../db/store';
import { getAdminAuth } from '../firebase/admin';

export const SESSION_COOKIE = 'lemma_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7-day persistent authenticated session

function secret(): string {
  return process.env.LEMMA_SESSION_SECRET ?? 'lemma-heights-production-session-hmac-key';
}

function signPayload(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 40);
}

/**
 * Encodes `uid:sessionVersion` signed with server HMAC secret.
 * Incrementing `sessionVersion` on `users/{uid}` immediately revokes existing cookies.
 */
export function sessionToken(userId: string, sessionVersion = 1): string {
  const body = Buffer.from(`${userId}:${sessionVersion}`, 'utf8').toString('base64url');
  return `${body}.${signPayload(body)}`;
}

export function verifyToken(
  token: string | undefined,
): { uid: string; sessionVersion: number } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = signPayload(body);
  try {
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const decoded = Buffer.from(body, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep <= 0) return { uid: decoded, sessionVersion: 1 };
    const uid = decoded.slice(0, sep);
    const ver = Number(decoded.slice(sep + 1)) || 1;
    return uid ? { uid, sessionVersion: ver } : null;
  } catch {
    return null;
  }
}

export function userRecordToStaffView(u: UserRecord): StaffUser {
  const active = u.accountStatus === 'active';
  return {
    id: u.uid,
    uid: u.uid,
    name: u.fullName,
    fullName: u.fullName,
    username: u.username || u.email.split('@')[0] || u.uid,
    email: u.email,
    phone: u.phoneNumber,
    phoneNumber: u.phoneNumber,
    profilePhoto: u.profilePhoto,
    role: u.role,
    accountStatus: u.accountStatus,
    emailVerified: u.emailVerified,
    jobTitle:
      u.jobTitle ||
      (u.role === 'super_admin'
        ? 'Super Administrator'
        : u.role === 'admin'
          ? 'Administrator'
          : u.role === 'receptionist'
            ? 'Receptionist'
            : u.role === 'cleaner'
              ? 'Housekeeping Attendant'
              : 'Registered Guest'),
    active,
    hiredOn: u.hiredOn || u.createdAt.slice(0, 10),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastSeenAt: u.lastLoginAt,
    lastLoginAt: u.lastLoginAt,
    shift: u.shift ?? null,
    permissions: u.permissions ?? null,
  };
}

export interface Session {
  uid: string;
  user: StaffUser;
  userRecord: UserRecord;
  permissions: Set<PermissionKey>;
}

/**
 * Resolves the current authenticated session against `users/{uid}` (and Firebase Admin
 * session cookies if issued via Firebase Auth). Always reads current role & status
 * so role promotions or account deactivations take effect immediately.
 */
export async function getSession(): Promise<Session | null> {
  await ensureCloudFirestoreHydrated();
  const store = await cookies();
  const rawCookie = store.get(SESSION_COOKIE)?.value;
  if (!rawCookie) return null;

  const db = getDb();
  let resolvedUid: string | null = null;
  let tokenVersion: number | null = null;

  const parsed = verifyToken(rawCookie);
  if (parsed) {
    resolvedUid = parsed.uid;
    tokenVersion = parsed.sessionVersion;
  } else {
    // Attempt Firebase Admin session cookie / ID token verification
    const adminAuth = getAdminAuth();
    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifySessionCookie(rawCookie, true);
        resolvedUid = decoded.uid;
      } catch {
        try {
          const decoded = await adminAuth.verifyIdToken(rawCookie, true);
          resolvedUid = decoded.uid;
        } catch {
          return null;
        }
      }
    }
  }

  if (!resolvedUid) return null;

  const userRec = (db.users ?? []).find((u) => u.uid === resolvedUid);
  if (userRec) {
    if (userRec.accountStatus !== 'active') return null;
    if (
      tokenVersion !== null &&
      userRec.sessionVersion &&
      tokenVersion < userRec.sessionVersion
    ) {
      return null;
    }
    const staffView = userRecordToStaffView(userRec);
    return {
      uid: userRec.uid,
      user: staffView,
      userRecord: userRec,
      permissions: permissionsFor(staffView),
    };
  }

  // Fallback for legacy staff record if not yet mirrored into db.users
  const legacyStaff = db.staff.find((s) => s.id === resolvedUid);
  if (!legacyStaff || !legacyStaff.active) return null;
  const synthesized: UserRecord = {
    uid: legacyStaff.id,
    fullName: legacyStaff.name,
    email: legacyStaff.email,
    phoneNumber: legacyStaff.phone,
    profilePhoto: '',
    role: legacyStaff.role,
    accountStatus: 'active',
    emailVerified: true,
    createdAt: `${legacyStaff.hiredOn}T08:00:00.000Z`,
    updatedAt: new Date().toISOString(),
    lastLoginAt: legacyStaff.lastSeenAt,
    username: legacyStaff.username,
    jobTitle: legacyStaff.jobTitle,
    shift: legacyStaff.shift,
    permissions: legacyStaff.permissions,
  };
  return {
    uid: legacyStaff.id,
    user: legacyStaff,
    userRecord: synthesized,
    permissions: permissionsFor(legacyStaff),
  };
}

export async function currentUserId(): Promise<string | null> {
  const s = await getSession();
  return s?.uid ?? null;
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
