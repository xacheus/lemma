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
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3000';
const DATA_FILE = process.env.E2E_DATA_FILE ||
  (process.env.LEMMA_DATA_DIR ? path.join(process.env.LEMMA_DATA_DIR, 'lemma-db.json') : null);

async function verifyLocalGuest(email, session) {
  if (!DATA_FILE) return false;
  const record = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const token = record.users.find((u) => u.email === email)?.emailVerificationToken;
  if (!token) return false;
  const response = await fetch(`${BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    headers: { cookie: `lemma_session=${jar.get(session)}` },
  });
  return response.status === 307 || response.status === 302;
}
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'chanda@lemma.test';
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
const bookingCookies = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function call(path, { method = 'GET', body, session = 'admin', raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const cookies = [];
  if (session && jar.has(session)) cookies.push(`lemma_session=${jar.get(session)}`);
  if (session && bookingCookies.has(session)) cookies.push(bookingCookies.get(session));
  if (cookies.length) headers.cookie = cookies.join('; ');
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const m = setCookie.match(/lemma_session=([^;]+)/);
    if (m) jar.set(session, m[1]);
    const bookingCookie = setCookie.match(/(lemma_booking_[^=;,]+=[^;,]+)/);
    if (bookingCookie && session) bookingCookies.set(session, bookingCookie[1]);
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
async function book(body, session = null) {
  const wait = lastBookingAt + 2200 - Date.now();
  if (wait > 0) await sleep(wait);
  lastBookingAt = Date.now();
  return call('/api/public/reservations', { method: 'POST', session, body: { countryOfResidence: 'Test country', nationality: 'Test nationality', ...body } });
}

const run = async () => {
  console.log(`\nLemma Apartments — end-to-end check against ${BASE}\n`);

  console.log('1. Staff sign-in & clean initial state');
  const login = await call('/api/auth/login', { method: 'POST', body: { username: ADMIN_EMAIL, password: ADMIN_PASSWORD }, session: 'admin' });
  check('administrator can sign in', login.json?.ok === true, JSON.stringify(login.json).slice(0, 200));

  const dataStats = await call('/api/data');
  check(
    'register summary hides backend storage internals',
    dataStats.json?.ok === true &&
      !('backendMode' in (dataStats.json?.data ?? {})) &&
      !('file' in (dataStats.json?.data ?? {})) &&
      !('sizeBytes' in (dataStats.json?.data ?? {})),
    JSON.stringify(dataStats.json?.data),
  );

  let snap = await call('/api/session');
  check(
    'session snapshot hides cloud & auth provider keys',
    !('cloudinaryCloudName' in (snap.json?.data?.integrations ?? {})) &&
      !('firebaseClientConfigured' in (snap.json?.data?.integrations ?? {})),
    JSON.stringify(snap.json?.data?.integrations),
  );

  let apartments = snap.json?.data?.apartments ?? [];
  if (apartments.length === 0) {
    check('fresh database starts with zero fake apartments', apartments.length === 0);
    const emptyHome = await fetch(`${BASE}/`).then((r) => r.text());
    check('empty-state homepage renders LodgingBusiness JSON-LD', emptyHome.includes('"@type":"LodgingBusiness"'));
    check('empty-state homepage has zero stock photos', !emptyHome.includes('/images/apartments/'));

    // Configure test payment account numbers & create real apartments via Admin API for E2E checks
    const existingMethods = snap.json?.data?.settings?.payments?.methods ?? [];
    const configuredMethods = existingMethods.map((m) =>
      m.id === 'airtel_money'
        ? { ...m, accountNumber: '0970000111', mobileNumber: '0970000111', recipientName: 'Lemma Apartments', instructions: 'Send via Airtel Money to 0970000111 quoting your booking reference.' }
        : m.id === 'mtn_money'
          ? { ...m, accountNumber: '0960000222', mobileNumber: '0960000222', recipientName: 'Lemma Apartments', instructions: 'Send via MTN MoMo to 0960000222 quoting your booking reference.' }
          : m,
    );
    await call('/api/settings', { method: 'PATCH', body: { payments: { methods: configuredMethods } } });

    await call('/api/apartments', {
      method: 'POST',
      body: {
        name: 'Barlaston Studio Suite',
        tier: 'studio',
        tagline: 'Self-catering ground-floor studio at Barlaston Park.',
        description: 'Private furnished studio apartment with kitchen, backup power and Wi-Fi.',
        maxGuests: 2,
        bedrooms: 0,
        bathrooms: 1,
        sizeSqm: 38,
        nightlyRate: 950,
        amenities: ['Wi-Fi', 'Backup power', 'Fully fitted kitchen'],
      },
    });
    await call('/api/apartments', {
      method: 'POST',
      body: {
        name: 'Barlaston One-Bedroom Suite',
        tier: 'deluxe',
        tagline: 'Separate lounge and bedroom for longer Lusaka stays.',
        description: 'Private one-bedroom apartment with full kitchen, backup power and Wi-Fi.',
        maxGuests: 3,
        bedrooms: 1,
        bathrooms: 1,
        sizeSqm: 54,
        nightlyRate: 1350,
        amenities: ['Wi-Fi', 'Backup power', 'Fully fitted kitchen', 'Washer'],
      },
    });

    snap = await call('/api/session');
    apartments = snap.json?.data?.apartments ?? [];
  }

  check('admin-created apartments load in the register', apartments.length >= 2, `${apartments.length} units`);
  const unit = apartments.find((a) => a.maxGuests >= 2) ?? apartments[0];

  console.log('\n2. Public pages & SEO routes render');
  for (const routePath of ['/', '/apartments', `/apartments/${unit.slug}`, '/about', '/contact', '/policies', '/robots.txt', '/sitemap.xml', '/opengraph-image']) {
    const { status } = await call(routePath, { raw: true, session: null });
    check(`GET ${routePath} → 200`, status === 200, `status ${status}`);
  }

  console.log('\n3. Guest account');
  const guestEmail = `guest-${Date.now()}@lemma.test`;
  const guestPhone = `+26097${String(Date.now()).slice(-7)}`;
  const reg = await call('/api/auth/register', {
    method: 'POST',
    session: 'guest',
    body: { fullName: 'Chanda Banda', email: guestEmail, phoneNumber: guestPhone, password: 'GuestPass2026!' },
  });
  check('guest can register', reg.json?.ok === true, JSON.stringify(reg.json).slice(0, 200));
  const guestCookie = jar.get('guest');
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

  console.log('\n3b. Administrator appointment (no bootstrap token)');
  const setupPage = await call('/setup-admin', { raw: true, session: null });
  check('the token provisioning page no longer exists', setupPage.status === 404, `status ${setupPage.status}`);
  const setupApi = await fetch(`${BASE}/api/auth/setup-admin`).then((r) => r.status);
  check('the provisioning endpoint no longer exists', setupApi === 404, `status ${setupApi}`);
  const adminSnap = await call('/api/session');
  check('the administrator role came from the user record', adminSnap.json?.data?.user?.role === 'admin' || adminSnap.json?.data?.user?.role === 'super_admin', adminSnap.json?.data?.user?.role);

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
    phone: guestPhone,
    email: guestEmail,
    notes: 'Two adults, arriving late.',
    agreedPolicy: true,
    paymentMethod: 'airtel_money',
  };
  const booking = await book(bookingBody, 'guest');
  check('guest can submit a booking request', booking.json?.ok === true, JSON.stringify(booking.json).slice(0, 240));
  const reservationId = booking.json?.data?.id;
  const reference = booking.json?.data?.reference;
  const total = booking.json?.data?.totalAmount;
  check('booking total is nights × rate', typeof total === 'number' && total > 0, String(total));
  check('deposit quoted at the configured percentage', typeof booking.json?.data?.depositDue === 'number');

  console.log('\n4b. Payment instructions follow the chosen method');
  const payInfo = booking.json?.data?.payment;
  const methodList = booking.json?.data?.methods ?? [];
  check('the booking returns payment instructions', Boolean(payInfo), JSON.stringify(payInfo));
  check('the instructions match the chosen channel', payInfo?.method === 'airtel_money', payInfo?.method);
  check('the destination is configured', Boolean(payInfo?.accountNumber), payInfo?.accountNumber);
  check('the booking reference is the payment reference', payInfo?.reference === reference);
  check('enabled Zambian payment channels are offered', methodList.length >= 3);
  const settingsSnap = await call('/api/session');
  const configured = settingsSnap.json?.data?.settings?.payments?.methods ?? [];
  const mtm = configured.find((m) => m.id === 'mtn_money');
  check(
    'MTN instructions quote the configured merchant number',
    !mtm?.accountNumber || (mtm.accountNumber.length > 0 && mtm.instructions.length > 0),
    mtm?.accountNumber,
  );

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
  check('public conflict response hides other guests and booking references', !JSON.stringify(overlapAfter.json).includes('Chanda Banda') && !JSON.stringify(overlapAfter.json).includes(reservationId) && !overlapAfter.json?.details);
  const sameDay = await book({ ...bookingBody, checkIn: isoAdd(33), checkOut: isoAdd(35) });
  check('check-out day is free for the next arrival', sameDay.json?.ok === true, JSON.stringify(sameDay.json).slice(0, 200));
  const backToBackId = sameDay.json?.data?.id;
  if (backToBackId) {
    await call(`/api/reservations/${backToBackId}/actions`, { method: 'POST', body: { kind: 'cancel', reason: 'e2e cleanup', refund: false } });
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

  console.log('\n7b-ii. Proof upload, review and approval');
  // A visitor books without signing in, uploads proof from the confirmation page, then
  // claims the booking by registering with the same email. Nothing may move a penny
  // until a person has verified the proof.
  const visitorEmail = `visitor-${Date.now()}@lemma.test`;
  // A phone number identifies a guest record, so give this run its own.
  const visitorPhone = `+26097${String(Date.now()).slice(-7)}`;
  const visitorBooking = await book({
    ...bookingBody,
    email: visitorEmail,
    // A phone number identifies a guest record, so give this run its own.
    phone: visitorPhone,
    fullName: 'Namwali Zulu',
    checkIn: isoAdd(400),
    checkOut: isoAdd(403),
  }, 'visitor');
  check('a visitor can book without an account', visitorBooking.json?.ok === true, JSON.stringify(visitorBooking.json).slice(0, 200));
  const visitorId = visitorBooking.json?.data?.id;
  const visitorTotal = visitorBooking.json?.data?.totalAmount;
  if (visitorId && visitorBooking.json?.data?.status === 'inquiry') {
    const confirmedVisitor = await call(`/api/reservations/${visitorId}/actions`, {
      method: 'POST', body: { kind: 'status', status: 'reserved', note: 'Confirmed for E2E test.' },
    });
    check('reception confirms the visitor enquiry', confirmedVisitor.json?.ok === true);
  }
  const proofPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAWklEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfg0QQAABbXy0zAAAAAElFTkSuQmCC';
  const proofSizeBytes = Buffer.from(proofPng.split(',')[1], 'base64').byteLength;
  if (visitorId) {
    const withCapability = await call(`/api/public/booking-access?reservationId=${visitorId}`, { session: 'visitor' });
    check('visitor capability opens only their booking', withCapability.status === 200 && withCapability.json?.data?.id === visitorId);
    const withoutCapability = await call(`/api/public/booking-access?reservationId=${visitorId}`, { session: null });
    check('a booking ID alone cannot open visitor details', withoutCapability.status === 404);
    const wrongCapability = await fetch(`${BASE}/api/public/booking-access?reservationId=${visitorId}`, { headers: { cookie: `lemma_booking_${visitorId}=${'A'.repeat(43)}` } });
    check('a wrong visitor capability is rejected', wrongCapability.status === 404);
    const invalidExchange = await call('/api/public/booking-access', { method: 'POST', session: null, body: { action: 'exchange', token: 'A'.repeat(43) } });
    check('an invalid recovery token cannot be exchanged', invalidExchange.status === 400);
    const recovery = await call('/api/public/booking-access', { method: 'POST', session: null, body: { action: 'request', reference: visitorBooking.json.data.reference, email: visitorEmail } });
    const mismatch = await call('/api/public/booking-access', { method: 'POST', session: null, body: { action: 'request', reference: visitorBooking.json.data.reference, email: 'wrong@example.invalid' } });
    check('recovery response does not disclose whether the details match', recovery.json?.data?.message === mismatch.json?.data?.message && recovery.status === 200 && mismatch.status === 200);
    const visitorClaim = await call('/api/payments/claims', {
      method: 'POST',
      session: 'visitor',
      body: {
        reservationId: visitorId,
        amount: Math.max(50, Math.round(visitorTotal * 0.5)),
        method: 'airtel_money',
        reference: `E2E-PROOF-${Date.now()}`,
        paidAt: new Date().toISOString().slice(0, 10),
        proof: { fileName: 'sms.png', mimeType: 'image/png', dataUrl: proofPng, sizeBytes: proofSizeBytes },
      },
    });
    check('a visitor can upload proof for the booking they just made', visitorClaim.json?.ok === true, JSON.stringify(visitorClaim.json).slice(0, 200));
    const proofClaimId = visitorClaim.json?.data?.claim?.id;
    check('the proof is stored against the claim', Boolean(visitorClaim.json?.data?.claim?.proof?.dataUrl));

    const outsider = await call('/api/payments/claims', {
      method: 'POST',
      session: null,
      body: { reservationId: visitorId, amount: 10, method: 'airtel_money', reference: 'X' },
    });
    check('an unauthorized visitor claim is refused', outsider.json?.ok === false, JSON.stringify(outsider.json).slice(0, 140));
    const anonymousPeek = await fetch(`${BASE}/api/payments/claims?reservationId=${visitorId}&method=airtel_money`);
    const peekBody = await anonymousPeek.text();
    check(
      'an anonymous quote never reveals the guest or the claim history',
      !peekBody.includes('Namwali') && !peekBody.includes(visitorPhone) && !peekBody.includes('sms.png'),
      String(anonymousPeek.status),
    );

    // The visitor now claims the booking by registering with the same email.
    const visitorAccount = await call('/api/auth/register', {
      method: 'POST',
      session: 'guest',
      body: { fullName: 'Namwali Zulu', email: visitorEmail, phoneNumber: visitorPhone, password: 'VisitorPass2026!' },
    });
    check('registering with the booking email creates an account', visitorAccount.json?.ok === true, JSON.stringify(visitorAccount.json).slice(0, 160));
    const beforeVerify = await call('/api/session', { session: 'guest' });
    check('an unverified email cannot claim an earlier visitor booking',
      !(beforeVerify.json?.data?.reservations ?? []).some((r) => r.id === visitorId));
    if (DATA_FILE) check('verifying the email links the earlier booking', await verifyLocalGuest(visitorEmail, 'guest'));
    const visitorSnap = await call('/api/session', { session: 'guest' });
    const afterProof = (visitorSnap.json?.data?.reservations ?? []).find((r) => r.id === visitorId);
    if (DATA_FILE) check('verified guest sees their visitor booking', Boolean(afterProof), afterProof ? afterProof.status : 'missing');
    check('an uploaded receipt leaves the balance untouched', afterProof?.balanceDue === visitorTotal, `${afterProof?.balanceDue} of ${visitorTotal}`);
    check('the guest stage reads as proof submitted', afterProof?.paymentStage === 'proof_submitted', afterProof?.paymentStage);

    if (proofClaimId) {
      const reviewed = await call(`/api/payments/claims/${proofClaimId}`);
      check('opening a claim records that it was reviewed', Boolean(reviewed.json?.data?.claim?.reviewedAt), JSON.stringify(reviewed.json?.data?.claim?.reviewedAt));
      const stageAfterReview = (await call('/api/session', { session: 'guest' })).json?.data?.reservations?.find((r) => r.id === visitorId);
      check('the guest stage moves to under verification once opened', stageAfterReview?.paymentStage === 'under_verification', stageAfterReview?.paymentStage);

      const approval = await call('/api/payments', {
        method: 'POST',
        body: {
          reservationId: visitorId,
          amount: Math.max(50, Math.round(visitorTotal * 0.5)),
          method: 'airtel_money',
          kind: 'deposit',
          reference: `E2E-PROOF-${Date.now()}`,
          claimId: proofClaimId,
        },
      });
      check('approving a claim records a payment', approval.json?.ok === true, JSON.stringify(approval.json).slice(0, 200));
      const approvedPayment = approval.json?.data?.payment;
      check('the approval is banked as awaiting verification', approvedPayment?.verificationStatus === 'pending' || approvedPayment?.verificationStatus === 'verified', approvedPayment?.verificationStatus);
      const beforeSign = (await call('/api/session')).json?.data?.reservations?.find((r) => r.id === visitorId);
      check('the balance still has not moved before verification', beforeSign?.balanceDue === visitorTotal, String(beforeSign?.balanceDue));
      const duplicate = await call('/api/payments', {
        method: 'POST',
        body: {
          reservationId: visitorId,
          amount: Math.max(50, Math.round(visitorTotal * 0.5)),
          method: 'airtel_money',
          kind: 'deposit',
          reference: `E2E-PROOF-${Date.now()}-B`,
          claimId: proofClaimId,
        },
      });
      check('the same proof cannot be approved twice', duplicate.json?.ok === false, JSON.stringify(duplicate.json).slice(0, 160));

      const signed = await call(`/api/payments/${approvedPayment.id}`, { method: 'PATCH', body: { status: 'verified', note: 'Matched on the statement.' } });
      check('the administrator can verify it', signed.json?.ok === true, JSON.stringify(signed.json).slice(0, 160));
      const paidReservation = signed.json?.data?.snapshot?.reservations?.find((r) => r.id === visitorId);
      check('the balance drops only after verification', paidReservation?.balanceDue === visitorTotal - Math.max(50, Math.round(visitorTotal * 0.5)), JSON.stringify({ due: paidReservation?.balanceDue }));
      check('a deposit promotes the booking to reserved', ['reserved', 'fully_paid'].includes(paidReservation?.status), paidReservation?.status);
      const receiptRows = signed.json?.data?.snapshot?.receipts?.filter((rc) => rc.reservationId === visitorId) ?? [];
      check('a unique receipt is generated on approval', receiptRows.length === 1 && /^[A-Z]+-\d{4}-\d+$/.test(receiptRows[0].receiptNumber), JSON.stringify(receiptRows.map((r) => r.receiptNumber)));
      check('the receipt carries the stay dates', Boolean(receiptRows[0]?.checkIn && receiptRows[0]?.checkOut && receiptRows[0]?.nights), JSON.stringify({ in: receiptRows[0]?.checkIn, out: receiptRows[0]?.checkOut }));

      const guestReceipt = await call(`/receipt/${receiptRows[0].id}`, { raw: true, session: 'guest' });
      check('the guest can open their receipt', guestReceipt.status === 200, `status ${guestReceipt.status}`);
      const receiptPdf = await fetch(`${BASE}/api/documents/receipt/${receiptRows[0].id}/pdf`, {
        headers: { cookie: `lemma_session=${jar.get('guest')}` },
      });
      check('the receipt PDF downloads for the guest', receiptPdf.status === 200 && receiptPdf.headers.get('content-type')?.includes('pdf'), `${receiptPdf.status} ${receiptPdf.headers.get('content-type')}`);
      const anonymousReceipt = await fetch(`${BASE}/receipt/${receiptRows[0].id}`, { redirect: 'manual' });
      check('a signed-out visitor cannot read the receipt', anonymousReceipt.status === 307 || anonymousReceipt.status === 404, `status ${anonymousReceipt.status}`);
      const guestNotified = (await call('/api/session', { session: 'guest' })).json?.data?.notifications ?? [];
      check('the guest is notified in-app that the payment was approved', guestNotified.length > 0, `${guestNotified.length} notifications`);

      // Rejection must not touch the money.
      const rejectionClaim = await call('/api/payments/claims', {
        method: 'POST',
        session: 'guest',
        body: { reservationId: visitorId, amount: 100, method: 'mtn_money', reference: `E2E-REJECT-${Date.now()}`, proof: { fileName: 'r.png', mimeType: 'image/png', dataUrl: proofPng, sizeBytes: proofSizeBytes } },
      });
      check('a guest can submit another claim on the same booking', rejectionClaim.json?.ok === true, JSON.stringify(rejectionClaim.json).slice(0, 160));
      const rejectId = rejectionClaim.json?.data?.claim?.id;
      if (rejectId) {
        const rejected = await call(`/api/payments/claims/${rejectId}`, { method: 'PATCH', body: { status: 'rejected', note: 'Screenshot was too blurry to read.' } });
        check('an administrator can reject a claim with a reason', rejected.json?.ok === true, JSON.stringify(rejected.json).slice(0, 160));
        const afterReject = (await call('/api/session', { session: 'guest' })).json?.data?.reservations?.find((r) => r.id === visitorId);
        check('a rejection leaves the verified balance alone', afterReject?.balanceDue === paidReservation?.balanceDue, `${afterReject?.balanceDue} vs ${paidReservation?.balanceDue}`);
        check('the guest stage reads as rejected', afterReject?.paymentStage === 'rejected', afterReject?.paymentStage);
        const guestCannotReject = await call(`/api/payments/claims/${rejectId}`, { method: 'PATCH', session: 'guest', body: { status: 'rejected', note: 'me' } });
        check('a guest cannot drive the review decision', guestCannotReject.json?.ok === false, String(guestCannotReject.status));
      }
    }
    // Put the original guest session back so later sections keep their own identity.
    jar.set('guest', guestCookie);
    await call(`/api/reservations/${visitorId}/actions`, { method: 'POST', body: { kind: 'cancel', reason: 'Automated end-to-end check finished.', refund: false } });
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
  check('homepage lists the published apartment', home.includes(unit.name));
  check('homepage quotes Kwacha rates', /K\d/.test(home));

  console.log('\n11. Amenities are opt-in');
  const amenityUnit = apartments.find((a) => a.id === unit.id) ?? apartments[0];
  const amenityPatch = await call(`/api/apartments/${amenityUnit.id}`, {
    method: 'PATCH',
    body: { amenities: ['Free Wi-Fi', 'Swimming pool', 'A private courtyard'] },
  });
  check('an administrator can set a custom amenity list', amenityPatch.json?.ok === true, JSON.stringify(amenityPatch.json).slice(0, 160));
  const publicUnit = await fetch(`${BASE}/apartments/${amenityUnit.slug}`).then((r) => r.text());
  check('a ticked amenity appears on the public page', publicUnit.includes('Swimming pool'));
  check('a hand-written amenity appears too', publicUnit.includes('A private courtyard'));
  check('an unticked amenity is absent', !publicUnit.includes('Gym') && !publicUnit.includes('Washing machine'));
  check('apartment detail page includes Apartment JSON-LD', publicUnit.includes('"@type":"Apartment"'));
  const guestAmenity = await call(`/api/apartments/${amenityUnit.id}`, {
    method: 'PATCH',
    session: 'guest',
    body: { amenities: ['Swimming pool'] },
  });
  check('a guest cannot change amenities', guestAmenity.json?.ok === false, String(guestAmenity.status));
  // Put the unit's own list back so the run leaves nothing odd behind.
  await call(`/api/apartments/${amenityUnit.id}`, { method: 'PATCH', body: { amenities: amenityUnit.amenities } });

  console.log('\n12. Homepage hero, clean copy and full-screen menu');
  const homeHtml = await fetch(`${BASE}/`).then((r) => r.text());
  check('the homepage renders the animated carousel', homeHtml.includes('aria-roledescription="carousel"'));
  check('the hero offers direct booking links', homeHtml.includes('Check availability') && homeHtml.includes('Request dates'));
  check('zero fake stock photography or sample disclaimers appear', !/\/images\/apartments\//.test(homeHtml) && !homeHtml.includes('Representative') && !homeHtml.includes('Sample catalogue'));
  check('zero infrastructure or vendor terms appear on public HTML', !/Brevo|Cloudinary|Firestore|Serverless/i.test(homeHtml));
  check('the menu uses a full-screen dialog', homeHtml.includes('aria-haspopup="dialog"'));
  check('the old short drawer is gone', !homeHtml.includes('max-h-[22rem]'));
  const staffHome = await fetch(`${BASE}/`, { headers: { cookie: `lemma_session=${jar.get('admin')}` } }).then((r) => r.text());
  check('staff see workspace navigation in the menu', staffHome.includes('Workspace'));
  const guestHome = await fetch(`${BASE}/`, { headers: { cookie: `lemma_session=${guestCookie}` } }).then((r) => r.text());
  check('guests see their own account section', guestHome.includes('My Account'));
  check('guests never receive staff menu entries', !guestHome.includes('Staff &amp; Users') && !guestHome.includes('Operations dashboard'));

  console.log('\n13. Role permissions');
  const receptionReg = await call('/api/staff', {
    method: 'POST',
    body: {
      name: `E2E Reception ${Date.now() % 1000}`,
      username: `recep${Date.now() % 100000}`,
      email: `recep${Date.now() % 100000}@lemma.test`,
      phone: '+260977000444',
      role: 'receptionist',
      jobTitle: 'Front desk',
      password: 'RecepPass2026!',
    },
  });
  check('an administrator can create a receptionist', receptionReg.json?.ok === true, JSON.stringify(receptionReg.json).slice(0, 160));
  const recepUser = receptionReg.json?.data?.staff ?? receptionReg.json?.data?.user;
  if (recepUser?.username) {
    const recepLogin = await call('/api/auth/login', {
      method: 'POST',
      session: 'recep',
      body: { username: recepUser.username, password: 'RecepPass2026!' },
    });
    check('the receptionist can sign in', recepLogin.json?.ok === true, JSON.stringify(recepLogin.json).slice(0, 120));
    check('a receptionist lands on the desk dashboard', recepLogin.json?.data?.home === '/admin', recepLogin.json?.data?.home);
    const recepPrice = await call(`/api/apartments/${unit.id}`, { method: 'PATCH', session: 'recep', body: { nightlyRate: 1 } });
    check('a receptionist cannot change prices', recepPrice.json?.ok === false, String(recepPrice.status));
    const recepSettings = await call('/api/settings', { method: 'PATCH', session: 'recep', body: { property: { name: 'Hijacked' } } });
    check('a receptionist cannot change property settings', recepSettings.json?.ok === false, String(recepSettings.status));
    const recepStaff = await call('/api/staff', {
      method: 'POST', session: 'recep',
      body: { name: 'X', username: `x${Date.now() % 9999}`, email: 'x@lemma.test', phone: '1', role: 'admin', jobTitle: 'x', password: 'Xpass2026!' },
    });
    check('a receptionist cannot create accounts', recepStaff.json?.ok === false, String(recepStaff.status));
  }

  console.log('\n14. Sign-in protection');
  const wrong = await call('/api/auth/login', { method: 'POST', session: 'none', body: { username: ADMIN_EMAIL, password: 'definitely-wrong' } });
  check('a wrong password is refused', wrong.json?.ok === false && wrong.status === 401, String(wrong.status));
  check('the refusal never reveals whether the account exists', /Incorrect|Invalid/i.test(wrong.json?.error ?? ''), wrong.json?.error);
  // A public registration must never be able to adopt an existing account.
  const hijack = await call('/api/auth/register', {
    method: 'POST', session: 'none',
    body: { fullName: 'Impostor', email: ADMIN_EMAIL, phoneNumber: '+260955000999', password: 'Impostor2026!' },
  });
  check('registration with an existing email is refused', hijack.json?.ok === false, JSON.stringify(hijack.json).slice(0, 140));

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
