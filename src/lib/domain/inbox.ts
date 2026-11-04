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
  const email = (session.user.email ?? '').toLowerCase();

  if (role !== 'guest') {
    return db.notifications.filter(
      (n) => !n.readAt && (n.recipientContact === 'in-app' || n.channel === 'in_app'),
    ).length;
  }

  const myGuestIds = new Set(
    db.guests.filter((g) => g.userId === session.uid || (email && g.email.toLowerCase() === email)).map((g) => g.id),
  );
  const myReservationIds = new Set(
    db.reservations
      .filter((r) => r.userId === session.uid || myGuestIds.has(r.guestId))
      .map((r) => r.id),
  );
  return db.notifications.filter(
    (n) =>
      !n.readAt &&
      ((n.reservationId && myReservationIds.has(n.reservationId)) ||
        (n.guestId && myGuestIds.has(n.guestId))),
  ).length;
}
