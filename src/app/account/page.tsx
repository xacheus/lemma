import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { PublicFooter, PublicHeader } from '@/components/public/site-chrome';
import { GuestAccountClient } from './account-client';
import { unreadForSession } from '@/lib/domain/inbox';

export const dynamic = 'force-dynamic';

export default async function GuestAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/account');
  const justRegistered = (await searchParams).welcome === '1';

  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const snapshot = buildSnapshot(db, session);

  return (
    <div className="public-shell flex min-h-screen flex-col">
      <PublicHeader property={db.settings.property} session={session} activePath="/account" unreadCount={unreadForSession(db, session)} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <GuestAccountClient initialSnapshot={snapshot} justRegistered={justRegistered} />
      </main>
      <PublicFooter property={db.settings.property} />
    </div>
  );
}
