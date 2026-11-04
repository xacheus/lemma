import { NextResponse } from 'next/server';
import { sessionToken } from '@/lib/auth/session';
import { readBody, sessionCookie } from '@/lib/api/http';
import { firebaseSessionSchema } from '@/lib/api/schemas';
import { ensureCloudFirestoreHydrated, runAtomicTransaction, StoreUnavailableError } from '@/lib/db/store';
import { ensureProfileForFirebaseUser } from '@/lib/domain/production-ops';
import { OperationError } from '@/lib/domain/operations';
import { getAdminAuth, isFirebaseAdminConfigured, syncFirebaseRoleClaims } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

/**
 * Exchanges a Firebase ID token for this application's session cookie.
 *
 * Firebase Console accounts — including the owner's first administrator — sign in
 * through the Firebase client SDK, which proves who they are but gives the server
 * nothing to read afterwards. This endpoint verifies that token with the Admin SDK,
 * makes sure a profile row exists for the account, and issues the same signed cookie
 * every other route already trusts.
 *
 * The role is never taken from the request. It comes from the profile row, which is
 * created as `guest` and only ever changed by an authorised administrator or by a
 * role set deliberately in the Firebase Console.
 *
 * If the deployment has not configured the Admin SDK, this returns 501 and the
 * password sign-in path is used instead — nothing is faked.
 */
export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Firebase sign-in is not enabled on this server. Sign in with the email and password on your account instead.',
          code: 'firebase_not_configured',
        },
        { status: 501 },
      );
    }

    const body = await readBody(req, firebaseSessionSchema);
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: 'Firebase Admin is unavailable.', code: 'firebase_not_configured' },
        { status: 501 },
      );
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(body.firebaseIdToken, true);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'That sign-in has expired. Sign in again.',
          code: 'invalid_token',
        },
        { status: 401 },
      );
    }

    await ensureCloudFirestoreHydrated();

    const user = await runAtomicTransaction((db) => {
      const profile = ensureProfileForFirebaseUser(
        db,
        {
          uid: decoded.uid,
          email: decoded.email ?? null,
          displayName: (decoded.name as string | undefined) ?? null,
          phoneNumber: decoded.phone_number ?? null,
          emailVerified: Boolean(decoded.email_verified),
        },
        // An account created by the owner in the Console has no password in this
        // database, which is exactly why it can never be taken over through the
        // public password sign-in form.
        false,
      );
      if (profile.accountStatus !== 'active') {
        throw new OperationError(
          `This account is ${profile.accountStatus}. Contact an administrator.`,
          403,
          'account_inactive',
        );
      }
      profile.lastLoginAt = new Date().toISOString();
      profile.updatedAt = profile.lastLoginAt;
      return profile;
    });

    // Keep the token claims in step so Firestore Security Rules evaluate the same
    // role this server just authorised. Best effort: rules also read the document.
    void syncFirebaseRoleClaims(user.uid, user.role, user.accountStatus);

    const response = NextResponse.json({
      ok: true,
      data: {
        uid: user.uid,
        email: user.email,
        name: user.fullName,
        role: user.role,
        jobTitle: user.jobTitle ?? (user.role === 'guest' ? 'Registered Guest' : user.role),
      },
    });
    response.cookies.set(sessionCookie(sessionToken(user.uid, user.sessionVersion ?? 1)));
    return response;
  } catch (error: unknown) {
    if (error instanceof OperationError || error instanceof StoreUnavailableError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error('[auth/firebase-session]', error);
    return NextResponse.json(
      { ok: false, error: 'Sign in could not be completed. Try again.', code: 'server_error' },
      { status: 500 },
    );
  }
}
