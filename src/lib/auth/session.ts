import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { PermissionKey, StaffUser, UserRecord } from '../domain/types';
import { permissionsFor } from '../domain/permissions';
import { ensureCloudFirestoreHydrated, getDb, mutate } from '../db/store';
import { getAdminAuth, getAdminFirestore } from '../firebase/admin';
import { applyConsoleRoleChange } from '../domain/production-ops';

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
 * Pulls the authoritative `role` / `accountStatus` from the Firestore user document.
 *
 * Staff roles are assigned and revoked in the Firebase Console, so the document wins
 * over this process's cached copy. Without this, a promotion made in the Console
 * would only appear after a redeploy — the cache is hydrated once per instance.
 *
 * Reads one document, ignores anything malformed, and writes only when the value
 * actually differs. When Firebase Admin is not configured (local development) there
 * is no Console to read, so the stored record stands.
 */
async function syncRoleFromFirestore(uid: string): Promise<void> {
  if (!process.env.FIREBASE_PROJECT_ID) return;
  const adminDb = getAdminFirestore();
  if (!adminDb) return;
  try {
    const snap = await adminDb.collection('users').doc(uid).get();
    if (!snap.exists) return;
    const data = snap.data() as { role?: unknown; accountStatus?: unknown; username?: unknown };
    const current = (getDb().users ?? []).find((u) => u.uid === uid);
    if (!current) return;
    const same =
      (typeof data.role !== 'string' || data.role === current.role) &&
      (typeof data.accountStatus !== 'string' || data.accountStatus === current.accountStatus) &&
      (typeof data.username !== 'string' || data.username === current.username);
    if (same) return;
    mutate((db) => {
      const row = (db.users ?? []).find((u) => u.uid === uid);
      if (row) applyConsoleRoleChange(db, row, data);
    });
  } catch (err) {
    console.warn('[session] Firestore role sync skipped:', err);
  }
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

  // A Console role change must be honoured on the very next request.
  await syncRoleFromFirestore(resolvedUid);

  const refreshedDb = getDb();
  const userRec = (refreshedDb.users ?? []).find((u) => u.uid === resolvedUid);
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
    void db;
    return {
      uid: userRec.uid,
      user: staffView,
      userRecord: userRec,
      permissions: permissionsFor(staffView),
    };
  }

  // Fallback for legacy staff record if not yet mirrored into db.users
  const legacyStaff = refreshedDb.staff.find((s) => s.id === resolvedUid);
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
