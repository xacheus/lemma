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

  if (resetToken) {
    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    await sendEmailNotification({
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
  }

  return NextResponse.json({
    ok: true,
    data: {
      requested: true,
      message: 'If an active account matches that email and email delivery is available, a reset link will be sent. If you do not receive it, contact reception.',
    },
  });
});

export const PUT = publicRoute(async ({ req }) => {
  const body = await readBody(req, resetPasswordSchema);
  await runAtomicTransaction((db) => completePasswordReset(db, body));
  return { reset: true };
});
