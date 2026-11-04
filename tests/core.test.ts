import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { cloudDocumentChanges, cloudDocuments } from '../src/lib/db/cloud-documents';
import { buildStartingCatalogue } from '../src/lib/db/starting-catalogue';
import { isSampleListing } from '../src/lib/domain/sample-listings';
import { createReservation } from '../src/lib/domain/operations';
import { registerCustomerAccount, verifyUserEmailToken, ensureProfileForFirebaseUser } from '../src/lib/domain/production-ops';
import { buildSnapshot } from '../src/lib/api/snapshot';
import type { PermissionKey } from '../src/lib/domain/types';
import { userRecordToStaffView } from '../src/lib/domain/staff-view';
import { signCloudinaryParams, createSignedUploadTicket } from '../src/lib/cloudinary/server';

const today = '2026-11-04';

// Store is imported after pointing it at a disposable local directory. The cloud
// tests exercise pure document diffs without requiring a Firebase service account.
mkdirSync(path.join(process.cwd(), '.data'), { recursive: true });
const temp = mkdtempSync(path.join(process.cwd(), '.data', 'test-'));
process.env.LEMMA_DATA_DIR = temp;

test.after(() => rmSync(temp, { recursive: true, force: true }));

test('a serverless deployment without Firebase credentials refuses local booking data', async () => {
  const { getDb, ensureCloudFirestoreHydrated, StoreUnavailableError } = await import('../src/lib/db/store');
  const names = [
    'VERCEL', 'LEMMA_SESSION_SECRET', 'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.VERCEL = '1';
    process.env.LEMMA_SESSION_SECRET = 'test-secret-only-for-local-unit-tests-1234';
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    assert.throws(() => getDb(), (error) =>
      error instanceof StoreUnavailableError &&
      error.code === 'storage_unavailable' &&
      error.message.includes('Booking records are unavailable'));
    await assert.rejects(() => ensureCloudFirestoreHydrated(), StoreUnavailableError);
    const { readPublicSiteData } = await import('../src/lib/public/read-site-data');
    assert.equal(await readPublicSiteData(), null);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('a new cloud database is empty, while local starter units have six stock photos each', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const fresh = createEmptyDatabase(today);
  assert.equal(fresh.apartments.length, 0);
  assert.equal(fresh.users?.length, 0);
  const sample = buildStartingCatalogue('2026-11-04T10:00:00.000Z').apartments;
  assert.equal(sample.length, 3);
  for (const apt of sample) {
    assert.ok(isSampleListing(apt));
    assert.equal(apt.gallery?.length, 6);
    assert.equal(apt.photos.length, 6);
    assert.ok(apt.gallery?.every((photo) => photo.description.includes('not taken at the property')));
  }
});

test('document diff writes updates and deletions; unchanged bookings are not rewritten', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  const samples = buildStartingCatalogue('2026-11-04T10:00:00.000Z').apartments;
  db.apartments.push(...samples);
  const before = cloudDocuments(db);
  db.apartments[0].nightlyRate += 100;
  db.apartments.splice(1, 1);
  const changes = cloudDocumentChanges(before, cloudDocuments(db));
  assert.deepEqual(changes.map((change) => change.path).sort(), ['apartments/apt-one_bed', 'apartments/apt-studio']);
  assert.equal(changes.find((change) => change.path === 'apartments/apt-one_bed')?.data, null);
  assert.equal(changes.find((change) => change.path === 'apartments/apt-studio')?.data?.nightlyRate, 1050);
});

test('local store rolls back a failed write and serializes concurrent mutations', async () => {
  const { getDb, runAtomicTransaction } = await import('../src/lib/db/store');
  const original = getDb().sequences.reservation;
  assert.equal(getDb().apartments.length, 3);
  await assert.rejects(
    () => runAtomicTransaction((db) => { db.sequences.reservation += 200; throw new Error('rollback'); }),
    /rollback/,
  );
  assert.equal(getDb().sequences.reservation, original);
  await Promise.all(Array.from({ length: 10 }, () => runAtomicTransaction(async (db) => {
    const old = db.sequences.reservation;
    await new Promise((resolve) => setTimeout(resolve, 2));
    db.sequences.reservation = old + 1;
  })));
  assert.equal(getDb().sequences.reservation, original + 10);
});

test('an unverified guest cannot inherit another visitor’s booking just by typing their email', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  const apt = buildStartingCatalogue('2026-11-04T10:00:00.000Z').apartments[0];
  db.apartments.push(apt);
  db.__today = today;
  const booking = createReservation(db, 'public', {
    apartmentId: apt.id,
    guest: { fullName: 'Earlier Visitor', email: 'shared@example.com', phone: '+260971234567' },
    checkIn: '2026-12-05', checkOut: '2026-12-08', guestCount: 2,
    source: 'website', asInquiry: true,
  });
  assert.equal(booking.status, 'inquiry');
  assert.equal(booking.userId, null);
  const { user, verificationToken } = registerCustomerAccount(db, {
    email: 'shared@example.com', fullName: 'Different Person', phoneNumber: '+260977777777',
    password: 'StrongerPass2026!',
  });
  const session = { uid: user.uid, user: userRecordToStaffView(user), userRecord: user, permissions: new Set<PermissionKey>() };
  assert.equal(db.guests.find((g) => g.id === booking.guestId)?.userId, undefined);
  assert.equal(buildSnapshot(db, session).reservations?.length, 0);
  verifyUserEmailToken(db, verificationToken);
  assert.equal(buildSnapshot(db, session).reservations?.length, 1);
  assert.equal(db.reservations[0].userId, user.uid);
});

test('Firebase Auth UID cannot claim a pre-existing staff account by email alone', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  const { user } = registerCustomerAccount(db, {
    email: 'manager@example.com', fullName: 'Property Manager', phoneNumber: '+260977777771',
    password: 'StrongerPass2026!',
  });
  user.role = 'admin';
  assert.throws(() => ensureProfileForFirebaseUser(db, {
    uid: 'different-firebase-uid', email: 'manager@example.com', displayName: 'Impostor',
    phoneNumber: null, emailVerified: false,
  }, false), /belongs to another account/);
  assert.equal(db.users?.length, 1);
  assert.equal(db.users?.[0].role, 'admin');
});

test('a signed upload ticket signs exactly the public ID and folder sent to Cloudinary', () => {
  const old = { key: process.env.CLOUDINARY_API_KEY, secret: process.env.CLOUDINARY_API_SECRET };
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  try {
    const ticket = createSignedUploadTicket({ category: 'apartment', apartmentId: 'apt-studio' });
    assert.equal(ticket.configured, true);
    assert.equal(ticket.signature, signCloudinaryParams({
      folder: ticket.folder, public_id: ticket.publicId,
      timestamp: ticket.timestamp, upload_preset: ticket.uploadPreset,
    }));
    assert.notEqual(ticket.publicId, createSignedUploadTicket({ category: 'apartment', apartmentId: 'apt-studio' }).publicId);
  } finally {
    if (old.key === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = old.key;
    if (old.secret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = old.secret;
  }
});
