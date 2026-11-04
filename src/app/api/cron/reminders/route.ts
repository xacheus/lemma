import { NextResponse } from 'next/server';
import { ensureCloudFirestoreHydrated, runReminderSweepOnStore, getDb } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled reminder sweep.
 *
 * Call this from a scheduler (Vercel Cron, a systemd timer, cron on the host) with
 * the secret in a header or as `?key=`:
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" https://<host>/api/cron/reminders
 *
 * It drafts the check-in, check-out and balance reminders defined in Settings and
 * nudges reception about guest payment claims that have sat past the review window.
 * Nothing is "sent": with no messaging provider connected the drafts land in the
 * notification list for a person to act on, exactly as the in-app reminders do.
 *
 * With CRON_SECRET unset the endpoint refuses every call rather than running
 * unauthenticated — an open endpoint that writes records is not a safe default.
 */
function authorised(req: Request): { ok: boolean; reason?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      reason:
        'CRON_SECRET is not configured on the server, so the scheduler endpoint is disabled. Set it to enable automatic reminders.',
    };
  }
  const header = req.headers.get('x-cron-secret') ?? '';
  const url = new URL(req.url);
  const query = url.searchParams.get('key') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const presented = header || bearer || query;
  if (!presented || presented !== secret) {
    return { ok: false, reason: 'Invalid scheduler secret.' };
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  await ensureCloudFirestoreHydrated();
  const before = getDb().notifications.length;
  const result = await runReminderSweepOnStore();
  return NextResponse.json({
    ok: true,
    data: {
      ...result,
      notificationsBefore: before,
      ranAt: new Date().toISOString(),
    },
  });
}

/** Some schedulers only issue POST; both are accepted with the same secret. */
export async function POST(req: Request) {
  return GET(req);
}
