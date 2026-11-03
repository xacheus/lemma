import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { AppProvider } from '@/components/providers/app';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/portal/cleaning');
  if (session.user.role === 'guest') redirect('/account');

  await ensureCloudFirestoreHydrated();
  const snapshot = buildSnapshot(getDb(), session);

  return (
    <AppProvider bootstrap={snapshot}>
      <div className="min-h-dvh bg-sand-50">{children}</div>
    </AppProvider>
  );
}
