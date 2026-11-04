import { buildSnapshot } from '@/lib/api/snapshot';
import type { Database } from '@/lib/domain/types';
import type { Session } from '@/lib/auth/session';

/**
 * Unread in-app notification count for the signed-in user, for the header badge.
 *
 * Counts only what the person is entitled to see: a guest sees notifications tied to
 * their own bookings, staff see the ones addressed to the desk. Nothing is
 * decremented here — reading them clears them through the notifications API.
 */
export function unreadForSession(db: Database, session: Session | null): number {
  if (!session) return 0;
  const role = session.user.role;
  if (role === 'guest') {
    return (buildSnapshot(db, session).notifications ?? []).filter((n) => !n.readAt).length;
  }
  return db.notifications.filter(
    (n) => !n.readAt && !n.recipientUid && (n.recipientContact === 'in-app' || n.channel === 'in_app'),
  ).length;
}
