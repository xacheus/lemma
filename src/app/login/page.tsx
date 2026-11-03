import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { defaultDashboardForRole } from '@/lib/domain/permissions';
import { LoginPage } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginRoute({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  if (session) {
    redirect(sp.next || defaultDashboardForRole(session.user.role));
  }

  await ensureCloudFirestoreHydrated();
  const db = getDb();
  const staffAccounts = db.staff
    .filter((s) => s.active)
    .slice(0, 4)
    .map((s) => ({
      name: s.name,
      identifier: s.email || s.username,
      role: s.role,
      jobTitle: s.jobTitle,
    }));

  const sampleGuest = (db.users ?? []).find((u) => u.role === 'guest' && u.accountStatus === 'active');
  const accounts = sampleGuest
    ? [
        ...staffAccounts.slice(0, 3),
        {
          name: sampleGuest.fullName,
          identifier: sampleGuest.email,
          role: sampleGuest.role,
          jobTitle: 'Registered Guest',
        },
      ]
    : staffAccounts;

  return (
    <LoginPage
      accounts={accounts}
      propertyName={db.settings.property.name}
      nextPath={sp.next || null}
    />
  );
}
