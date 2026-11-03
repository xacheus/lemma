/**
 * Consistency harness for the demo dataset. Run with:
 *   node --experimental-strip-types scripts/check-seed.ts
 *
 * The brief demands specific headline figures (12 apartments, 8 occupied, K48,500
 * banked this month, 70% occupancy, 3 arrivals, 2 departures). Nothing in the app
 * hardcodes them — this script asserts that the generated data *produces* them.
 */
import { createSeedDatabase } from '../src/lib/db/seed.ts';
import { dashboard, buildReport, periodBounds, guestSummary, decorateAll, financialsFor } from '../src/lib/domain/selectors.ts';
import { snapshotForNight, checkAvailability, searchAvailability } from '../src/lib/domain/availability.ts';

const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const db = createSeedDatabase(today);

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

const snap = snapshotForNight(db, today);
const dash = dashboard(db);

console.log(`\n== dataset (${today}) ==`);
console.log(
  `apartments ${db.apartments.length} · guests ${db.guests.length} · reservations ${db.reservations.length} · payments ${db.payments.length} · tasks ${db.housekeeping.length} · notifications ${db.notifications.length} · staff ${db.staff.length}`,
);

check('total apartments', db.apartments.length, 12);
check('occupied tonight', snap.occupied, 8);
check('available tonight', snap.available, 3);
check('cleaning tonight', snap.cleaning, 1);
check("today's check-ins", dash.checkInsToday.length, 3);
check("today's check-outs", dash.checkOutsToday.length, 2);
check('monthly revenue (verified, net of refunds)', dash.monthRevenue, 48500);
check('occupancy this month on the books', dash.monthOccupancyRate, 70);

const report = buildReport(db, { ...periodBounds(today, 'month'), period: 'month' });
check('report revenue matches dashboard card', report.revenue, dash.monthRevenue);
check('report occupancy matches dashboard card', report.occupancyRate, dash.monthOccupancyRate);

// ---- booking integrity -------------------------------------------------------
let overlaps = 0;
let badNights = 0;
let badTotals = 0;
let negativeBalance = 0;
for (const r of db.reservations) {
  if (r.nights !== Math.max(0, (Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86400000)) badNights += 1;
  if (r.totalAmount !== r.nights * r.nightlyRate - r.discount) badTotals += 1;
  const f = financialsFor(db, r);
  if (f.balanceDue < 0) negativeBalance += 1;
  if (f.verifiedPaid > r.totalAmount + 0.001) negativeBalance += 1;
  if (!['cancelled', 'inquiry'].includes(r.status)) {
    for (const o of db.reservations) {
      if (o.id === r.id || o.apartmentId !== r.apartmentId) continue;
      if (['cancelled', 'inquiry'].includes(o.status)) continue;
      if (r.checkIn < o.checkOut && o.checkIn < r.checkOut) overlaps += 1;
    }
  }
}
check('overlapping confirmed reservations', overlaps, 0);
check('reservations with wrong night count', badNights, 0);
check('reservations with wrong total', badTotals, 0);
check('folios over-paid or negative', negativeBalance, 0);

// the availability engine must agree with the data it was fed
let falseAvailable = 0;
for (const r of db.reservations.filter((x) => x.status !== 'cancelled' && x.status !== 'inquiry')) {
  const probe = checkAvailability(db, {
    apartmentId: r.apartmentId,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    excludeReservationId: r.id,
    today,
    allowPast: true,
  });
  // A window that is already sold should still be re-bookable for that apartment once
  // the incumbent is ignored — unless a maintenance hold explains the block.
  if (!probe.available && probe.conflicts.length === 0 && r.status !== 'checked_out' && probe.reason !== 'maintenance') {
    falseAvailable += 1;
    console.log(`   blocked without conflict: ${r.reference} ${r.apartmentId} ${r.checkIn}..${r.checkOut} reason=${probe.reason}`);
  }
}
check('availability engine false negatives', falseAvailable, 0);

// ---- conflict prevention is real, and non-blocking statuses do not block ----
const freeWindowFor = (aptId: string) => {
  for (let i = 1; i < 40; i += 1) {
    const from = addDaysISO(today, i);
    const probe = checkAvailability(db, { apartmentId: aptId, checkIn: from, checkOut: addDaysISO(from, 2), today });
    if (!probe.available && probe.conflicts.length) return { from, taken: probe.conflicts[0] };
  }
  return null;
};
const clash = freeWindowFor('apt-2');
if (clash) {
  const retry = checkAvailability(db, { apartmentId: 'apt-2', checkIn: clash.from, checkOut: addDaysISO(clash.from, 2), today });
  check('overlapping request is refused on a sold window', retry.available, false);
  check('refusal names the incumbent reservation', !!retry.conflicts[0]?.reference, true);
} else {
  console.log('FAIL  no sold window found to test overlap prevention');
  failures += 1;
}
for (const soft of ['cancelled', 'inquiry'] as const) {
  // find one whose window nobody else is holding, then prove the engine freed it
  const r = db.reservations.find(
    (x) =>
      x.status === soft &&
      !db.reservations.some(
        (o) =>
          o.id !== x.id &&
          o.apartmentId === x.apartmentId &&
          !['cancelled', 'inquiry'].includes(o.status) &&
          x.checkIn < o.checkOut &&
          o.checkIn < x.checkOut,
      ),
  );
  if (!r) {
    console.log(`SKIP  no unconflicted ${soft} window in the dataset`);
    continue;
  }
  const probe = checkAvailability(db, { apartmentId: r.apartmentId, checkIn: r.checkIn, checkOut: r.checkOut, today, allowPast: true });
  check(`${soft} reservation does not hold inventory`, probe.available || probe.reason === 'maintenance', true);
}

const freeApt = db.apartments.find((a) => !db.reservations.some((r) => r.apartmentId === a.id && r.checkIn <= today && today < r.checkOut && r.status !== 'cancelled' && r.status !== 'inquiry'));
if (freeApt) {
  const clash = checkAvailability(db, { apartmentId: freeApt.id, checkIn: today, checkOut: '2099-01-01', today, allowPast: true });
  console.log(`probe ${freeApt.name} for a 30-year stay -> available=${clash.available} (should be false: beyond the booking horizon)`);
}

const search = searchAvailability(db, { checkIn: today, checkOut: tomorrow(today), guests: 2, today });
console.log(`\n== public search for tonight (1 night, 2 guests) ==`);
console.log(`  ${search.hits.filter((h) => h.available).length} of ${search.hits.length} apartments returned as bookable`);
check('search respects occupied inventory', search.hits.filter((h) => h.available).length <= 4, true);

// ---- the worked example from the brief --------------------------------------
const john = decorateAll(db).find((r) => r.guest?.fullName === 'John Banda' && r.checkIn === today);
console.log('\n== worked example: John Banda, Deluxe Suite ==');
if (john) {
  console.log(
    `  ${john.apartment?.name} · ${john.nights} nights × K${john.nightlyRate} = K${john.totalAmount} · banked K${john.verifiedPaid} · balance K${john.balanceDue} · ${john.paymentStatus}`,
  );
  check('example total', john.totalAmount, 3600);
  check('example deposit', john.verifiedPaid, 1800);
  check('example balance', john.balanceDue, 1800);
  check('example payment status', john.paymentStatus, 'partially_paid');
} else {
  console.log('  MISSING');
  failures += 1;
}

// ---- guest + housekeeping sanity --------------------------------------------
const guestsWithoutHistory = db.guests.filter((g) => guestSummary(db, g).stays === 0).length;
console.log(`\nguests with at least one booking: ${db.guests.length - guestsWithoutHistory}/${db.guests.length}`);
check('guests with no bookings at all', guestsWithoutHistory, 0);
check('at least 15 guest profiles', db.guests.length >= 15, true);
check('at least 20 reservations', db.reservations.length >= 20, true);

const statuses = new Set(db.reservations.map((r) => r.status));
check('all six booking statuses represented', [...statuses].sort().join(','), 'cancelled,checked_in,checked_out,fully_paid,inquiry,reserved');
const payStatuses = new Set(db.reservations.map((r) => r.paymentStatus));
console.log(`payment statuses present: ${[...payStatuses].sort().join(', ')}`);
check('refunded folio exists', payStatuses.has('refunded'), true);
check('pending-verification payment exists', db.payments.some((p) => p.verificationStatus === 'pending'), true);

const unassigned = db.housekeeping.filter((t) => t.status === 'needs_cleaning' && !t.assignedTo).length;
console.log(`open cleaning tasks: ${db.housekeeping.filter((t) => t.status !== 'clean').length} (unassigned: ${unassigned})`);

// ---- prior-month revenue for the trend chart ---------------------------------
console.log('\n== revenue trend (dashboard card source) ==');
for (const point of dash.revenueSeries) console.log(`  ${point.label}: K${point.value.toLocaleString('en-US')}`);
console.log('\n== occupancy trend ==');
for (const point of dash.occupancySeries) console.log(`  ${point.label}: ${point.rate}% (${point.occupied}/${point.sellable} room-nights)`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

function addDaysISO(d: string, n: number) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function tomorrow(d: string) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
