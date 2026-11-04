import { trustedEmailSiteOrigin } from '../notifications/site-origin';
import { createHash, randomBytes } from 'node:crypto';
import type { Database, Reservation } from '../domain/types';
import type { Session } from '../auth/session';

const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
export const bookingCookieName = (reservationId: string) => `lemma_booking_${reservationId}`;
export const createBookingAccessToken = () => randomBytes(32).toString('base64url');
export const bookingAccessHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Keep only a one-way hash in Firestore; the browser retains the random secret. */
export function addBookingAccess(db: Database, reservationId: string, token: string, maxAgeSeconds = MAX_AGE_SECONDS) {
  db.bookingAccess = db.bookingAccess ?? [];
  db.bookingAccess.push({ id: bookingAccessHash(token), reservationId, expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString() });
}

/** Consumes a short-lived bearer link and rotates it to a fresh browser capability. */
export function exchangeBookingAccess(db: Database, token: string, newToken: string): string | null {
  const key = bookingAccessHash(token);
  const access = db.bookingAccess?.find((item) => item.id === key && item.expiresAt > new Date().toISOString());
  const booking = db.reservations.find((r) => r.id === access?.reservationId);
  if (!access || !booking || booking.userId || db.guests.find((g) => g.id === booking.guestId)?.userId) return null;
  db.bookingAccess = (db.bookingAccess ?? []).filter((item) => item.id !== key);
  addBookingAccess(db, booking.id, newToken);
  return booking.id;
}

export function ownsBooking(db: Database, reservation: Reservation, session: Session | null): boolean {
  if (!session || session.user.role !== 'guest') return false;
  if (reservation.userId) return reservation.userId === session.uid;
  return db.guests.find((g) => g.id === reservation.guestId)?.userId === session.uid;
}

export function hasBookingAccess(db: Database, reservation: Reservation, session: Session | null, token?: string): boolean {
  if (ownsBooking(db, reservation, session)) return true;
  // A visitor capability cannot be used to access a booking now owned by an account.
  if (reservation.userId || db.guests.find((g) => g.id === reservation.guestId)?.userId) return false;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const hash = bookingAccessHash(token);
  return Boolean(db.bookingAccess?.some((access) => access.id === hash && access.reservationId === reservation.id && access.expiresAt > new Date().toISOString()));
}

export function bookingCookie(reservationId: string, token: string) {
  return { name: bookingCookieName(reservationId), value: token, httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE_SECONDS };
}

/** Email links must use an explicitly configured origin, never an untrusted Host header. */
export function bookingAccessLink(token: string): string | null {
  const origin = trustedEmailSiteOrigin();
  return origin ? `${origin}/booking/access#token=${encodeURIComponent(token)}` : null;
}
