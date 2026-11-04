import { redirect } from 'next/navigation';
import { readPublicSiteData } from '@/lib/public/read-site-data';
import { SiteUnavailable } from '@/components/public/site-unavailable';
import { defaultDashboardForRole } from '@/lib/domain/permissions';
import { LoginPage } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginRoute({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const state = await readPublicSiteData();
  if (!state) return <SiteUnavailable />;
  const { db, session } = state;
  const sp = await searchParams;
  if (session) {
    redirect(sp.next || defaultDashboardForRole(session.user.role));
  }

  return (
    <LoginPage propertyName={db.settings.property.name} nextPath={sp.next || null} />
  );
}
