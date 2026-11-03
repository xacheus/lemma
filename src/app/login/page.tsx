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

  return (
    <LoginPage propertyName={db.settings.property.name} nextPath={sp.next || null} />
  );
}
