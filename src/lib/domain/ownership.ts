import type { Database } from './types';

/** An explicit owner always wins over weaker links or verified-email matching. */
export function ownsGuestResource(
  db: Database,
  uid: string,
  verifiedEmail: string,
  resource: { userId?: string | null; guestId?: string | null; reservationId?: string | null; docEmail?: string | null },
): boolean {
  if (resource.userId) return resource.userId === uid;
  let guestId = resource.guestId;
  if (resource.reservationId) {
    const reservation = db.reservations.find((item) => item.id === resource.reservationId);
    if (!reservation) return false;
    if (reservation.userId) return reservation.userId === uid;
    guestId = reservation.guestId;
  }
  if (guestId) {
    const guest = db.guests.find((item) => item.id === guestId);
    if (!guest) return false;
    if (guest.userId) return guest.userId === uid;
    return Boolean(verifiedEmail && guest.email?.toLowerCase() === verifiedEmail.toLowerCase());
  }
  return Boolean(verifiedEmail && resource.docEmail?.toLowerCase() === verifiedEmail.toLowerCase());
}
