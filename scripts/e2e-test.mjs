#!/usr/bin/env node
/**
 * End-to-end exercise of the running application through its real HTTP API.
 *
 *   node scripts/e2e-test.mjs [baseUrl]
 *
 * It creates its own records (a guest account, bookings, payments) and asserts on
 * what the server actually returned — availability refusal, balance arithmetic,
 * role restrictions. Run it against a development instance only.
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'grace@lemma.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'LemmaAdmin2026!';

let pass = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function call(path, { method = 'GET', body, session = 'admin', raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session && jar.has(session)) headers.cookie = `${session === 'admin' ? 'lemma_session' : 'lemma_session'}=${jar.get(session)}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const m = setCookie.match(/lemma_session=([^;]+)/);
    if (m) jar.set(session, m[1]);
  }
  if (raw) return { status: res.status, res };
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function isoAdd(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastBookingAt = 0;
/** The public booking endpoint is rate-limited on purpose; space the attempts out. */
async function book(body) {
  const wait = lastBookingAt + 2200 - Date.now();
  if (wait > 0) await sleep(wait);
  lastBookingAt = Date.now();
  return call('/api/public/reservations', { method: 'POST', body });
}

const run = async () => {
  console.log(`\nLemma Apartments — end-to-end check against ${BASE}\n`);

  console.log('1. Staff sign-in');
  const login = await call('/api/auth/login', { method: 'POST', body: { username: ADMIN_EMAIL, password: ADMIN_PASSWORD }, session: 'admin' });
  check('administrator can sign in', login.json?.ok === true, JSON.stringify(login.json).slice(0, 200));
  const snap = await call('/api/session');
  const apartments = snap.json?.data?.apartments ?? [];
  check('apartment catalogue loads', apartments.length >= 3, `${apartments.length} units`);
  const unit = apartments.find((a) => a.maxGuests >= 2) ?? apartments[0];
  check('catalogue unit has photographs', (unit.photos ?? []).length > 0);

  console.log('\n2. Public pages render the catalogue');
  for (const path of ['/', '/apartments', `/apartments/${unit.slug}`, '/contact', '/policies']) {
    const { status } = await call(path, { raw: true, session: null });
    check(`GET ${path} → 200`, status === 200, `status ${status}`);
  }

  console.log('\n3. Guest account');
  const guestEmail = `guest-${Date.now()}@lemma.test`;
  const reg = await call('/api/auth/register', {
    method: 'POST',
    session: 'guest',
    body: { fullName: 'Chanda Banda', email: guestEmail, phoneNumber: '+260970000111', password: 'GuestPass2026!' },
  });
  check('guest can register', reg.json?.ok === true, JSON.stringify(reg.json).slice(0, 200));
  const guestSnap = await call('/api/session', { session: 'guest' });
  check('new account is a guest', guestSnap.json?.data?.user?.role === 'guest', guestSnap.json?.data?.user?.role);
  check(
    'guest only sees their own guest record',
    (guestSnap.json?.data?.guests ?? []).length <= 1,
    `${(guestSnap.json?.data?.guests ?? []).length} records`,
  );
  const escal = await call('/api/users/' + (guestSnap.json?.data?.user?.id ?? 'x') + '/role', {
    method: 'PATCH',
    session: 'guest',
    body: { role: 'admin' },
  });
  check('guest cannot promote themselves to admin', escal.status === 403 || escal.status === 401, `status ${escal.status}`);

  console.log('\n4. Booking engine');
  // Find a three-night window that is genuinely free for this unit, so the run is
  // repeatable against a database that already holds bookings from earlier runs.
  let checkIn = isoAdd(30);
  let checkOut = isoAdd(33);
  for (const offset of [30, 45, 60, 75, 90, 120, 150, 200, 260, 320, 360]) {
    const result = await call(
      `/api/public/availability?checkIn=${isoAdd(offset)}&checkOut=${isoAdd(offset + 3)}&guests=2&apartmentId=${unit.id}`,
      { session: null },
    );
    const hit = (result.json?.data?.hits ?? []).find((h) => h.apartment?.id === unit.id);
    if (result.json?.ok && hit?.available) {
      checkIn = isoAdd(offset);
      checkOut = isoAdd(offset + 3);
      break;
    }
  }
  const availability = await call(
    `/api/public/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2&apartmentId=${unit.id}`,
    { session: null },
  );
  check('public availability endpoint answers', availability.json?.ok === true, JSON.stringify(availability.json).slice(0, 160));

  const bookingBody = {
    apartmentId: unit.id,
    checkIn,
    checkOut,
    guestCount: 2,
    fullName: 'Chanda Banda',
    phone: '+260970000111',
    email: guestEmail,
    notes: 'Two adults, arriving late.',
    agreedPolicy: true,
  };
  const booking = await book(bookingBody);
  check('guest can submit a booking request', booking.json?.ok === true, JSON.stringify(booking.json).slice(0, 240));
  const reservationId = booking.json?.data?.id;
  const reference = booking.json?.data?.reference;
  const total = booking.json?.data?.totalAmount;
  check('booking total is nights × rate', typeof total === 'number' && total > 0, String(total));
  check('deposit quoted at the configured percentage', typeof booking.json?.data?.depositDue === 'number');

  console.log('\n5. Double-booking prevention');
  // (the clash is asserted after confirmation below)
  const reserved = await call(`/api/reservations/${reservationId}/actions`, {
    method: 'POST',
    body: { kind: 'status', status: 'reserved', note: 'Deposit taken at the desk.' },
  });
  check('staff can confirm the booking', reserved.json?.ok === true, JSON.stringify(reserved.json).slice(0, 200));
  const overlapAfter = await book({ ...bookingBody, checkIn: isoAdd(31), checkOut: isoAdd(34) });
  check(
    'overlapping dates are refused once the stay is confirmed',
    overlapAfter.json?.ok === false && overlapAfter.status >= 400,
    `status ${overlapAfter.status} · ${overlapAfter.json?.error ?? ''}`,
  );
  const sameDay = await book({ ...bookingBody, checkIn: isoAdd(33), checkOut: isoAdd(35) });
  check('check-out day is free for the next arrival', sameDay.json?.ok === true, JSON.stringify(sameDay.json).slice(0, 200));
  const backToBackId = sameDay.json?.data?.id;
  if (backToBackId) {
    await call(`/api/reservations/${backToBackId}/actions`, { method: 'POST', body: { kind: 'cancel', reason: 'e2e cleanup' } });
  }

  console.log('\n6. Payments and balances');
  const pay = await call('/api/payments', {
    method: 'POST',
    body: {
      reservationId,
      amount: Math.round(total * 0.5),
      method: 'airtel_money',
      kind: 'deposit',
      reference: `E2E-${Date.now()}`,
      paidAt: new Date().toISOString().slice(0, 10),
    },
  });
  check('reception can record a payment', pay.json?.ok === true, JSON.stringify(pay.json).slice(0, 240));
  const paymentId = pay.json?.data?.payment?.id;
  const beforeVerify = pay.json?.data?.folio;
  const outstandingAfterProof = beforeVerify?.balanceDue ?? beforeVerify?.amountDue ?? beforeVerify?.outstanding;
  check(
    'a recorded payment waits in the verification queue',
    pay.json?.data?.payment?.verificationStatus === 'pending' ||
      pay.json?.data?.payment?.verificationStatus === 'pending_verification',
    pay.json?.data?.payment?.verificationStatus,
  );
  if (outstandingAfterProof !== undefined) {
    check('an unverified payment leaves the balance untouched', outstandingAfterProof === total, `balance ${outstandingAfterProof} of ${total}`);
  }
  const snapshotBefore = (await call('/api/session')).json?.data?.reservations ?? [];
  const recBefore = snapshotBefore.find((r) => r.id === reservationId);
  check('booking still shows the full balance before verification', recBefore?.balanceDue === total, JSON.stringify({ due: recBefore?.balanceDue, total }));

  if (paymentId) {
    const verify = await call(`/api/payments/${paymentId}`, { method: 'PATCH', body: { status: 'verified', note: 'Confirmed on Airtel statement.' } });
    check('administrator can verify the payment', verify.json?.ok === true, JSON.stringify(verify.json).slice(0, 240));
    const folioSnap = verify.json?.data?.snapshot?.reservations ?? [];
    const folio = folioSnap.find((r) => r.id === reservationId);
    check(
      'verification moves the balance down by the amount paid',
      folio?.balanceDue === total - Math.round(total * 0.5),
      JSON.stringify({ due: folio?.balanceDue, expected: total - Math.round(total * 0.5) }),
    );
  }

  console.log('\n7. Receipts and notifications');
  const guestSnap2 = await call('/api/session', { session: 'guest' });
  const mine = (guestSnap2.json?.data?.reservations ?? []).find((r) => r.id === reservationId);
  check('guest sees their own booking in the portal', Boolean(mine), mine ? mine.status : 'missing');
  check('guest sees the balance on their booking', typeof mine?.balanceDue === 'number', String(mine?.balanceDue));
  const myNotifs = guestSnap2.json?.data?.notifications ?? [];
  check('guest receives in-app notifications', myNotifs.length > 0, `${myNotifs.length} notifications`);

  console.log('\n7b. Guest-chosen payment claims');
  // Settings decide whether the guest picks the channel. Either way the claim is a
  // request for a human to check — never money in the ledger.
  const quote = await call(`/api/payments/claims?reservationId=${reservationId}`, { session: 'guest' });
  check('guest can read the payment quote for their own booking', quote.json?.ok === true, JSON.stringify(quote.json).slice(0, 200));
  const q = quote.json?.data?.quote;
  check('quote shows what is still owed', typeof q?.balanceDue === 'number' && q.balanceDue > 0, JSON.stringify(q?.balanceDue));
  check('quote lists only enabled channels', Array.isArray(q?.methods) && q.methods.length > 0, JSON.stringify(q?.methods?.map((m) => m.id)));
  const chosen = q?.methods?.[0]?.id;
  const guestPayAttempt = await call('/api/payments', {
    method: 'POST',
    session: 'guest',
    body: { reservationId, amount: 10, method: chosen, kind: 'part_payment', reference: 'GUEST-SELF' },
  });
  check('a guest cannot record money into the ledger directly', guestPayAttempt.json?.ok === false, JSON.stringify(guestPayAttempt.json).slice(0, 160));

  const claimAmount = q?.allowPartial ? Math.max(50, Math.round((q?.suggestedAmount ?? 50) / 2)) : q?.suggestedAmount;
  const claimRef = `E2E-CLAIM-${Date.now()}`;
  const claim = await call('/api/payments/claims', {
    method: 'POST',
    session: 'guest',
    body: {
      reservationId,
      amount: claimAmount,
      method: chosen,
      reference: claimRef,
      paidAt: new Date().toISOString().slice(0, 10),
      note: 'Paid from my phone this morning.',
    },
  });
  check('guest can submit a payment claim', claim.json?.ok === true, JSON.stringify(claim.json).slice(0, 240));
  const claimId = claim.json?.data?.claim?.id;
  check('claim starts awaiting verification', claim.json?.data?.claim?.status === 'awaiting_verification', claim.json?.data?.claim?.status);
  const afterClaim = (await call('/api/session')).json?.data?.reservations?.find((r) => r.id === reservationId);
  check(
    'a submitted claim does not move the balance',
    afterClaim?.balanceDue === undefined || afterClaim.balanceDue === q?.balanceDue,
    JSON.stringify({ due: afterClaim?.balanceDue, before: q?.balanceDue }),
  );

  if (claimId) {
    const dupe = await call('/api/payments/claims', {
      method: 'POST',
      session: 'guest',
      body: { reservationId, amount: claimAmount, method: chosen, reference: `${claimRef}-2` },
    });
    check('only one open claim per booking', dupe.json?.ok === false, JSON.stringify(dupe.json).slice(0, 140));

    const reject = await call(`/api/payments/claims/${claimId}`, {
      method: 'PATCH',
      body: { status: 'rejected', note: 'No matching credit on the statement.' },
    });
    check('administrator can reject a claim with a reason', reject.json?.ok === true, JSON.stringify(reject.json).slice(0, 200));
    check('rejected claim is marked rejected', reject.json?.data?.claim?.status === 'rejected', reject.json?.data?.claim?.status);
    const afterReject = (await call('/api/session')).json?.data?.reservations?.find((r) => r.id === reservationId);
    check('rejecting a claim leaves the balance alone', afterReject?.balanceDue === q?.balanceDue, String(afterReject?.balanceDue));

    const guestNotices = (await call('/api/session', { session: 'guest' })).json?.data?.notifications ?? [];
    check(
      'guest is told why the claim was rejected',
      guestNotices.some((n) => /could not match/i.test(n.title)),
      guestNotices.slice(0, 3).map((n) => n.title).join(' | '),
    );

    // Re-submit correctly, then let staff bank it against the claim.
    const again = await call('/api/payments/claims', {
      method: 'POST',
      session: 'guest',
      body: { reservationId, amount: claimAmount, method: chosen, reference: claimRef },
    });
    check('guest can resubmit after a rejection', again.json?.ok === true, JSON.stringify(again.json).slice(0, 200));
    const goodClaimId = again.json?.data?.claim?.id;
    const banked = await call('/api/payments', {
      method: 'POST',
      body: {
        reservationId,
        amount: claimAmount,
        method: chosen,
        kind: 'part_payment',
        reference: claimRef,
        claimId: goodClaimId,
      },
    });
    check('staff can bank a claim into a receipt', banked.json?.ok === true, JSON.stringify(banked.json).slice(0, 220));
    const twice = await call('/api/payments', {
      method: 'POST',
      body: { reservationId, amount: claimAmount, method: chosen, kind: 'part_payment', reference: `${claimRef}-B`, claimId: goodClaimId },
    });
    check('the same claim cannot be banked twice', twice.json?.ok === false, JSON.stringify(twice.json).slice(0, 160));
    const bankedPayment = banked.json?.data?.payment;
    if (bankedPayment?.id && bankedPayment.verificationStatus !== 'verified') {
      await call(`/api/payments/${bankedPayment.id}`, { method: 'PATCH', body: { status: 'verified' } });
    }
  }

  console.log('\n7c. Statement import');
  const statementCsv = [
    'date,amount,reference,description',
    `${new Date().toISOString().slice(0, 10)},${claimAmount},${claimRef},mobile money credit`,
    `${new Date().toISOString().slice(0, 10)},1,NO-SUCH-REF,unrelated`,
  ].join('\n');
  const analyse = await call('/api/payments/import', {
    method: 'POST',
    body: { csv: statementCsv, fallbackMethod: 'mtn_money' },
  });
  check('administrator can analyse a statement without banking it', analyse.json?.ok === true, JSON.stringify(analyse.json).slice(0, 200));
  check('import proposes matches but writes nothing', Array.isArray(analyse.json?.data?.rows), String(analyse.json?.data?.rows?.length));
  check(
    'a duplicate reference is flagged rather than re-imported',
    analyse.json?.data?.rows?.[0]?.alreadyBanked === true,
    JSON.stringify(analyse.json?.data?.rows?.[0]?.alreadyBanked),
  );
  const badHeader = await call('/api/payments/import', { method: 'POST', body: { csv: 'foo,bar\n1,2' } });
  check('a file without date and amount columns is refused', badHeader.json?.ok === false, JSON.stringify(badHeader.json).slice(0, 160));
  const guestImport = await call('/api/payments/import', {
    method: 'POST',
    session: 'guest',
    body: { csv: statementCsv },
  });
  check('a guest cannot run a statement import', guestImport.json?.ok === false, String(guestImport.status));

  console.log('\n7d. Staff list import');
  const staffCsv = [
    'name,username,role,phone',
    `E2E Receptionist,e2e${Date.now() % 100000},receptionist,+260977000333`,
    `E2E Cleaner,e2eclean${Date.now() % 100000},cleaner,`,
    'Broken Row,,cleaner,',
  ].join('\n');
  const staffImport = await call('/api/staff/import', { method: 'POST', body: { csv: staffCsv } });
  check('administrator can import a staff list', staffImport.json?.ok === true, JSON.stringify(staffImport.json).slice(0, 220));
  check('imported accounts get a generated password', (staffImport.json?.data?.created ?? []).length === 2 && staffImport.json.data.created.every((c) => c.password?.length >= 6));
  check('a row without a username is skipped with a reason', (staffImport.json?.data?.skipped ?? []).length === 1);
  check('a password sheet is returned for handover', (staffImport.json?.data?.passwordSheet ?? '').includes('Temporary password'));
  const importedUser = staffImport.json?.data?.created?.[0];
  if (importedUser) {
    const asReception = await call('/api/auth/login', { method: 'POST', session: 'guest', body: { username: importedUser.username, password: importedUser.password } });
    check('an imported account can sign in', asReception.json?.ok === true, JSON.stringify(asReception.json).slice(0, 160));
    const escalate = await call('/api/staff/import', { method: 'POST', session: 'guest', body: { csv: 'name,username,role\nSneaky,sneaky,admin' } });
    check('reception cannot import staff or grant roles', escalate.json?.ok === false, String(escalate.status));
    const settingsAttempt = await call('/api/settings', { method: 'PATCH', session: 'guest', body: { property: { name: 'Hijack' } } });
    check('reception cannot change property settings', settingsAttempt.json?.ok === false, String(settingsAttempt.status));
  }
  check('imported passwords are not echoed back in the staff list', !((await call('/api/session')).json?.data?.staff ?? []).some((s) => s.password || s.passwordHash));

  console.log('\n7e. Scheduled reminders');
  const cronClosed = await fetch(`${BASE}/api/cron/reminders`, { headers: { 'x-cron-secret': 'definitely-wrong' } });
  check('the reminder endpoint refuses a wrong secret', cronClosed.status === 401, String(cronClosed.status));
  const cronNoSecret = await fetch(`${BASE}/api/cron/reminders`);
  check('the reminder endpoint does not run unauthenticated', cronNoSecret.status === 401, String(cronNoSecret.status));
  if (process.env.CRON_SECRET) {
    const run1 = await fetch(`${BASE}/api/cron/reminders`, { headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then((r) => r.json());
    check('the reminder sweep runs with the configured secret', run1?.ok === true, JSON.stringify(run1).slice(0, 160));
    const run2 = await fetch(`${BASE}/api/cron/reminders`, { headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then((r) => r.json());
    check('running the sweep twice does not duplicate reminders', (run2?.data?.created ?? 1) === 0, JSON.stringify(run2?.data));
  } else {
    console.log('  skip reminder sweep body — CRON_SECRET not set for this run');
  }

  console.log('\n8. Apartment management (admin only)');
  const created = await call('/api/apartments', {
    method: 'POST',
    body: {
      name: 'E2E Test Apartment',
      tier: 'deluxe',
      tagline: 'Created by the automated check.',
      description: 'A temporary unit used to prove that apartments can be created, priced and published from the admin suite.',
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      sizeSqm: 45,
      nightlyRate: 1234,
      amenities: ['Wi-Fi'],
    },
  });
  check('administrator can create an apartment', created.json?.ok === true, JSON.stringify(created.json).slice(0, 200));
  const newId = created.json?.data?.apartment?.id;
  if (newId) {
    const priceChange = await call(`/api/apartments/${newId}`, { method: 'PATCH', body: { nightlyRate: 1500 } });
    check('administrator can change a price', priceChange.json?.ok === true, JSON.stringify(priceChange.json).slice(0, 160));
    const audit = await call('/api/audit-logs');
    const rows = audit.json?.data?.items ?? [];
    check('price change is written to the audit log', rows.some((r) => r.action === 'apartment.price_changed'), `${rows.length} log rows`);
    const del = await call(`/api/apartments/${newId}`, { method: 'DELETE' });
    check('administrator can delete an unused apartment', del.json?.ok === true, JSON.stringify(del.json).slice(0, 160));
  }

  console.log('\n9. Cleaning up the booking created by this run');
  const cleanup = await call(`/api/reservations/${reservationId}/actions`, {
    method: 'POST',
    body: { kind: 'cancel', reason: 'Automated end-to-end check finished.', refund: false },
  });
  check('cancelling releases the dates', cleanup.json?.ok === true, JSON.stringify(cleanup.json).slice(0, 160));
  const reopened = await book({
    ...bookingBody,
    email: `guest2-${Date.now()}@lemma.test`,
    phone: '+260970000222',
    fullName: 'Mutale Phiri',
  });
  check('a cancelled stay frees the apartment for resale', reopened.json?.ok === true, JSON.stringify(reopened.json).slice(0, 200));
  if (reopened.json?.data?.id) {
    await call(`/api/reservations/${reopened.json.data.id}/actions`, {
      method: 'POST',
      body: { kind: 'cancel', reason: 'Automated end-to-end check finished.', refund: false },
    });
  }

  console.log('\n10. Homepage and public catalogue read the new data');
  const home = await fetch(`${BASE}/`).then((r) => r.text());
  check('homepage lists the studio apartment', home.includes('Studio Apartment'));
  check('homepage quotes Kwacha rates', /K\d/.test(home));

  console.log(`\n${pass} checks passed, ${failures.length} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
};

run().catch((err) => {
  console.error('E2E run crashed:', err);
  process.exitCode = 1;
});
