import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession, verifyToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { AppProvider } from '@/components/providers/app';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

/**
 * Server-rendered entry to the admin suite. The snapshot is built here and handed to
 * the client provider so the first paint already has data — no skeleton flash — and
 * the role projection happens before anything reaches the browser.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const userId = verifyToken(store.get('lemma_session')?.value);
  if (!userId) redirect('/login');

  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.role === 'cleaner') redirect('/portal/cleaning');

  const snapshot = buildSnapshot(getDb(), session);

  return (
    <AppProvider bootstrap={snapshot}>
      <AdminShell>{children}</AdminShell>
    </AppProvider>
  );
}
