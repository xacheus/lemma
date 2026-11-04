import { ownsGuestResource } from '../src/lib/domain/ownership';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDatabase } from '../src/lib/db/store';
import { buildStartingCatalogue } from '../src/lib/db/starting-catalogue';
import { createReservation, setReservationStatus } from '../src/lib/domain/operations';
import { requestBookingCancellation, registerCustomerAccount } from '../src/lib/domain/production-ops';
import { buildSnapshot } from '../src/lib/api/snapshot';
import { userRecordToStaffView } from '../src/lib/domain/staff-view';
import { addBookingAccess, bookingAccessHash, createBookingAccessToken, exchangeBookingAccess, hasBookingAccess } from '../src/lib/booking/access';
import { permissionsFor } from '../src/lib/domain/permissions';

function setup() {
  const db = createEmptyDatabase('2026-11-04');
  db.apartments = buildStartingCatalogue('2026-11-04').apartments;
  const account = registerCustomerAccount(db, { email: 'owner@example.invalid', fullName: 'Account Owner', phoneNumber: '1234', password: 'Password123!' }).user;
  account.emailVerified = true;
  return { db, account };
}
function book(db: ReturnType<typeof createEmptyDatabase>, opts: { email: string; phone?: string; userId?: string; checkIn?: string; publicSubmission?: boolean }) {
  return createReservation(db, opts.userId ?? 'public', { apartmentId: db.apartments[0].id, checkIn: opts.checkIn ?? '2026-12-01', checkOut: '2026-12-03', guestCount: 1, source: 'website', asInquiry: true, userId: opts.userId, publicSubmission: opts.publicSubmission ?? true, guest: { fullName: 'Guest', email: opts.email, phone: opts.phone ?? '' } });
}

test('public submission cannot merge with another account by contact details', () => {
  const { db, account } = setup();
  const owned = book(db, { email: account.email, phone: account.phoneNumber, userId: account.uid });
  const oldGuest = db.guests.find((g) => g.id === owned.guestId)!;
  const impostor = book(db, { email: account.email, phone: account.phoneNumber });
  assert.notEqual(impostor.guestId, owned.guestId);
  assert.equal(oldGuest.userId, account.uid);
  assert.equal(oldGuest.fullName, 'Guest');
});

test('capabilities are random, scoped, expiring and overridden by explicit ownership', () => {
  const { db, account } = setup();
  const first = book(db, { email: 'visitor@example.invalid' });
  const second = book(db, { email: 'other@example.invalid' });
  const token = createBookingAccessToken();
  addBookingAccess(db, first.id, token);
  assert.notEqual(db.bookingAccess![0].id, token);
  assert.equal(db.bookingAccess![0].id, bookingAccessHash(token));
  assert.equal(hasBookingAccess(db, first, null), false);
  assert.equal(hasBookingAccess(db, first, null, createBookingAccessToken()), false);
  assert.equal(hasBookingAccess(db, first, null, token), true);
  assert.equal(hasBookingAccess(db, second, null, token), false);
  db.bookingAccess![0].expiresAt = '2000-01-01T00:00:00.000Z';
  assert.equal(hasBookingAccess(db, first, null, token), false);
  first.userId = account.uid;
  const user = userRecordToStaffView(account);
  assert.equal(hasBookingAccess(db, first, { uid: account.uid, user, userRecord: account, permissions: permissionsFor(user) }, undefined), true);
  assert.equal(hasBookingAccess(db, first, null, token), false);
});

test('verified email does not expose a booking owned by someone else, or staff notes', () => {
  const { db, account } = setup();
  const myBooking = book(db, { email: account.email, userId: account.uid });
  const foreign = book(db, { email: account.email });
  foreign.userId = 'other-account';
  const guest = db.guests.find((g) => g.id === myBooking.guestId)!;
  guest.internalNotes = 'staff-only-secret';
  const snapshot = buildSnapshot(db, userRecordToStaffView(account));
  assert.ok(snapshot.reservations?.some((r) => r.id === myBooking.id));
  assert.ok(!snapshot.reservations?.some((r) => r.id === foreign.id));
  assert.ok(!JSON.stringify(snapshot).includes('staff-only-secret'));
});

test('accepting an overlapping inquiry fails instead of double booking', () => {
  const { db, account } = setup();
  const first = book(db, { email: 'first@example.invalid' });
  const second = book(db, { email: 'second@example.invalid' });
  setReservationStatus(db, account.uid, first.id, 'reserved');
  assert.throws(() => setReservationStatus(db, account.uid, second.id, 'reserved'), /already booked/);
  assert.equal(second.status, 'inquiry');
});

test('foreign-owned documents and bookings cannot be claimed or cancelled by matching email', () => {
  const { db, account } = setup();
  const booking = book(db, { email: account.email });
  booking.userId = 'other-owner';
  assert.equal(ownsGuestResource(db, account.uid, account.email, { reservationId: booking.id }), false);
  assert.equal(ownsGuestResource(db, account.uid, account.email, { userId: 'other-owner', docEmail: account.email }), false);
  assert.throws(() => requestBookingCancellation(db, account.uid, booking.id, 'bad'), /only request cancellation for your own/);
  booking.userId = null;
  const guest = db.guests.find((g) => g.id === booking.guestId)!;
  guest.userId = 'other-owner';
  assert.equal(ownsGuestResource(db, account.uid, account.email, { guestId: guest.id, docEmail: account.email }), false);
  assert.throws(() => requestBookingCancellation(db, account.uid, booking.id, 'bad'), /only request cancellation for your own/);
  guest.userId = null;
  assert.equal(ownsGuestResource(db, account.uid, '', { reservationId: booking.id }), false);
  assert.equal(ownsGuestResource(db, account.uid, account.email, { reservationId: booking.id }), true);
});

test('one-time recovery links rotate to a new capability and cannot be replayed', () => {
  const { db, account } = setup();
  const visitor = book(db, { email: 'visitor@example.invalid' });
  const token = createBookingAccessToken();
  const next = createBookingAccessToken();
  addBookingAccess(db, visitor.id, token, 1800);
  assert.equal(exchangeBookingAccess(db, token, next), visitor.id);
  assert.equal(exchangeBookingAccess(db, token, createBookingAccessToken()), null);
  assert.equal(hasBookingAccess(db, visitor, null, next), true);
  const expired = createBookingAccessToken();
  addBookingAccess(db, visitor.id, expired, -1);
  assert.equal(exchangeBookingAccess(db, expired, createBookingAccessToken()), null);
  const noLongerVisitor = createBookingAccessToken();
  addBookingAccess(db, visitor.id, noLongerVisitor);
  visitor.userId = account.uid;
  assert.equal(exchangeBookingAccess(db, noLongerVisitor, createBookingAccessToken()), null);
});
