import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDatabase } from '../src/lib/db/store';
import { buildStartingCatalogue } from '../src/lib/db/starting-catalogue';
import { createReservation, paymentQuote, setReservationStatus, markNotification } from '../src/lib/domain/operations';
import { registerCustomerAccount } from '../src/lib/domain/production-ops';
import { settingsSchema } from '../src/lib/api/schemas';
import { paymentDetails, publicPaymentMethod } from '../src/lib/domain/payment-details';
import { buildSnapshot } from '../src/lib/api/snapshot';
import { userRecordToStaffView } from '../src/lib/domain/staff-view';

const today = '2026-11-04';

test('configured payment details are validated and only enabled methods appear in guest quotes', () => {
  const db = createEmptyDatabase(today);
  db.apartments = buildStartingCatalogue(today).apartments;
  const airtel = db.settings.payments.methods.find((m) => m.id === 'airtel_money')!;
  Object.assign(airtel, { recipientName: 'Test recipient', mobileNumber: 'test-mobile', merchantCode: 'test-merchant', agentCode: 'test-agent', instructions: 'Test instructions' });
  const bank = db.settings.payments.methods.find((m) => m.id === 'bank_transfer')!;
  bank.enabled = false;
  bank.bankAccountNumber = 'private-disabled-test';
  assert.equal(settingsSchema.safeParse({ payments: { methods: db.settings.payments.methods } }).success, true);
  assert.equal(settingsSchema.safeParse({ payments: { methods: [airtel, airtel] } }).success, false);
  assert.equal(settingsSchema.safeParse({ payments: { methods: [{ ...airtel, enabled: 'yes' }] } }).success, false);
  const booking = createReservation(db, 'public', {
    apartmentId: db.apartments[0].id, checkIn: '2026-12-01', checkOut: '2026-12-02',
    guestCount: 1, source: 'website', asInquiry: true,
    guest: { fullName: 'Test Guest', email: 'guest@example.invalid' },
  });
  const quote = paymentQuote(db, booking);
  assert.ok(!quote.methods.some((m) => m.id === 'bank_transfer'));
  const publicAirtel = quote.methods.find((m) => m.id === 'airtel_money')!;
  assert.equal(publicAirtel.merchantCode, 'test-merchant');
  assert.equal(publicAirtel.agentCode, 'test-agent');
  assert.equal(publicAirtel.mobileNumber, 'test-mobile');
  assert.ok(!JSON.stringify(quote).includes('private-disabled-test'));
  assert.deepEqual(paymentDetails(publicPaymentMethod(airtel)).map((d) => d.label), ['Recipient', 'Mobile money number', 'Merchant code', 'Agent code']);
  airtel.mobileNumber = 'test-edited';
  assert.equal(paymentQuote(db, booking).methods.find((m) => m.id === 'airtel_money')?.mobileNumber, 'test-edited');
});

test('guest history excludes internal notifications and read state can be reversed', () => {
  const db = createEmptyDatabase(today);
  db.apartments = buildStartingCatalogue(today).apartments;
  const { user } = registerCustomerAccount(db, { email: 'guest@example.invalid', fullName: 'Test Guest', phoneNumber: 'test', password: 'test-password' });
  const booking = createReservation(db, user.uid, {
    userId: user.uid, apartmentId: db.apartments[0].id, checkIn: '2026-12-01', checkOut: '2026-12-02',
    guestCount: 1, source: 'website', asInquiry: true,
    guest: { fullName: 'Test Guest', email: user.email },
  });
  const guest = userRecordToStaffView(user);
  let snapshot = buildSnapshot(db, guest);
  assert.ok(snapshot.notifications?.some((n) => n.event === 'new_booking'));
  assert.ok(!snapshot.notifications?.some((n) => n.recipientName === 'Front office'));
  const entry = db.notifications.find((n) => n.event === 'new_booking')!;
  assert.equal(entry.deliveryStatus, 'in_app_only');
  markNotification(db, entry.id, { read: true });
  assert.ok(entry.readAt);
  markNotification(db, entry.id, { read: false });
  assert.equal(entry.readAt, null);
  setReservationStatus(db, user.uid, booking.id, 'reserved');
  snapshot = buildSnapshot(db, guest);
  assert.ok(snapshot.notifications?.some((n) => n.event === 'booking_confirmation'));
});
