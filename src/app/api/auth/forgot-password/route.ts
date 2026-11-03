import { NextResponse } from 'next/server';
import { publicRoute, readBody } from '@/lib/api/http';
import { forgotPasswordSchema, resetPasswordSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { completePasswordReset, createPasswordResetRequest } from '@/lib/domain/operations';
import { buildBrandedEmailHtml, sendEmailNotification } from '@/lib/notifications/providers';

export const runtime = 'nodejs';

export const POST = publicRoute(async ({ req }) => {
  const body = await readBody(req, forgotPasswordSchema);
  const { resetToken, email, propertyName } = await runAtomicTransaction((db) => ({
    ...createPasswordResetRequest(db, body.email),
    propertyName: db.settings.property.name,
  }));

  let emailDelivered = false;
  if (resetToken) {
    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    const sent = await sendEmailNotification({
      to: email,
      subject: `Password reset — ${propertyName}`,
      textBody: `Use this link within 60 minutes to reset your password:\n${resetUrl}`,
      htmlBody: buildBrandedEmailHtml({
        propertyName,
        heading: 'Reset your account password',
        bodyLines: [
          'A password reset was requested for your account.',
          'Open the link below within 60 minutes to choose a new password:',
          resetUrl,
        ],
      }),
    });
    emailDelivered = sent.ok;
  }

  return NextResponse.json({
    ok: true,
    data: {
      requested: true,
      emailDelivered,
      message: emailDelivered
        ? 'If an active account matches that email, a password reset link has been sent.'
        : 'Password reset token recorded. Connect RESEND_API_KEY or Firebase Auth client email reset in production to deliver reset emails automatically.',
    },
  });
});

export const PUT = publicRoute(async ({ req }) => {
  const body = await readBody(req, resetPasswordSchema);
  await runAtomicTransaction((db) => completePasswordReset(db, body));
  return { reset: true };
});
