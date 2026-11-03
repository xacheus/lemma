import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, verifyToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { AppProvider } from '@/components/providers/app';

export const dynamic = 'force-dynamic';

/**
 * The cleaner's own workspace: a phone-first list of the jobs assigned to them and
 * nothing else. It gets the same role-projected snapshot as the admin suite, which is
 * built server-side, so no financial or guest data ever reaches this page's bundle.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const userId = verifyToken(store.get('lemma_session')?.value);
  if (!userId) redirect('/login');

  const session = await getSession();
  if (!session) redirect('/login');

  const snapshot = buildSnapshot(getDb(), session);

  return (
    <AppProvider bootstrap={snapshot}>
      <div className="min-h-dvh bg-sand-50">{children}</div>
    </AppProvider>
  );
}
