import { NextResponse } from 'next/server';
import { sessionToken } from '@/lib/auth/session';
import { runAtomicTransaction, StoreUnavailableError } from '@/lib/db/store';
import { HttpError, readBody, sessionCookie } from '@/lib/api/http';
import { registerSchema } from '@/lib/api/schemas';
import { registerCustomerAccount, OperationError } from '@/lib/domain/operations';
import { getAdminAuth } from '@/lib/firebase/admin';
import { buildBrandedEmailHtml, sendEmailNotification } from '@/lib/notifications/providers';
import { take } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // The public sign-up form is unauthenticated, so it is throttled before any work is
  // done. Without this a script can create accounts as fast as the database accepts them.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  const limit = take(`register:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many sign-up attempts. Please wait ${limit.retryAfterSeconds} seconds and try again.`,
        code: 'rate_limited',
      },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    // Reject any attempt to smuggle a privileged role in the raw JSON body
    const rawJson = (await req.clone().json().catch(() => ({}))) as Record<string, unknown>;
    if (
      rawJson.role !== undefined &&
      rawJson.role !== 'guest'
    ) {
      throw new HttpError(
        'Privileged roles cannot be selected during public registration. All new accounts start with the guest role.',
        403,
        'role_escalation_blocked',
      );
    }

    const body = await readBody(req, registerSchema);

    let firebaseUid: string | undefined;
    if (body.firebaseIdToken) {
      const adminAuth = getAdminAuth();
      if (!adminAuth) throw new HttpError('Sign-up is temporarily unavailable.', 503, 'auth_unavailable');
      const decoded = await adminAuth.verifyIdToken(body.firebaseIdToken, true);
      if (!decoded.email_verified || decoded.email?.toLowerCase() !== body.email.trim().toLowerCase()) {
        throw new HttpError('Verify the email on your account before signing up.', 403, 'email_unverified');
      }
      firebaseUid = decoded.uid;
    }

    const { user, verificationToken, propertyName } = await runAtomicTransaction((db) => {
      const created = registerCustomerAccount(db, {
        fullName: body.fullName,
        email: body.email,
        phoneNumber: body.phoneNumber,
        password: body.password,
        firebaseUid,
      });
      return {
        ...created,
        propertyName: db.settings.property.name,
      };
    });

    // Firebase sign-up tokens have already proved the email. Local password
    // accounts get a verification link if an email provider is connected.
    let emailSent = false;
    if (!user.emailVerified) {
      const origin = new URL(req.url).origin;
      const verifyUrl = `${origin}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
      const emailResult = await sendEmailNotification({
        to: user.email,
        subject: `Verify your email — ${propertyName}`,
        textBody: `Welcome to ${propertyName}, ${user.fullName}.\n\nVerify your email address by visiting:\n${verifyUrl}`,
        htmlBody: buildBrandedEmailHtml({
          propertyName,
          heading: 'Verify your email address',
          bodyLines: [
            `Hello ${user.fullName},`,
            `Thank you for registering an account with ${propertyName}. Confirm your email address using the link below:`,
            verifyUrl,
          ],
        }),
      });
      emailSent = emailResult.ok;
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        id: user.uid,
        uid: user.uid,
        name: user.fullName,
        email: user.email,
        role: user.role, // Guaranteed 'guest'
        emailSent,
      },
    });
    response.cookies.set(sessionCookie(sessionToken(user.uid, user.sessionVersion ?? 1)));
    return response;
  } catch (error) {
    if (error instanceof HttpError || error instanceof OperationError || error instanceof StoreUnavailableError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    // A storage outage is not the guest's mistake and must not read like a rejection of
    // what they typed. Say so plainly, and mark it retryable so the form can invite them
    // to press the button again rather than to change their details.
    console.error('[register] unexpected failure:', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          'We could not finish creating your account because our records service is unavailable. Nothing was lost. Please try again in a moment.',
        code: 'server_error',
        retryable: true,
      },
      { status: 500 },
    );
  }
}
