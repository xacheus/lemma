import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

/**
 * The public booking site is the front door of this product; until those pages ship,
 * the root sends visitors to the workspace they can actually use. Staff land on the
 * dashboard, everyone else on the sign-in screen.
 */
export default async function RootPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === 'cleaner' ? '/portal/cleaning' : '/admin');
  redirect('/login');
}
