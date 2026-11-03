import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { getDb } from '@/lib/db/store';
import { LoginPage } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginRoute() {
  const store = await cookies();
  const userId = verifyToken(store.get('lemma_session')?.value);
  if (userId && getDb().staff.some((s) => s.id === userId && s.active)) redirect('/admin');

  const db = getDb();
  const accounts = db.staff
    .filter((s) => s.active)
    .slice(0, 4)
    .map((s) => ({ name: s.name, username: s.username, role: s.role, jobTitle: s.jobTitle }));

  return (
    <LoginPage accounts={accounts} propertyName={db.settings.property.name} />
  );
}
