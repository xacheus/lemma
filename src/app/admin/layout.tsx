import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { AppProvider } from '@/components/providers/app';
import { AdminShell } from '@/components/admin/shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');
  if (session.user.role === 'cleaner') redirect('/portal/cleaning');
  if (session.user.role === 'guest') redirect('/account');

  await ensureCloudFirestoreHydrated();
  const snapshot = buildSnapshot(getDb(), session);

  return (
    <AppProvider bootstrap={snapshot}>
      <AdminShell>{children}</AdminShell>
    </AppProvider>
  );
}
