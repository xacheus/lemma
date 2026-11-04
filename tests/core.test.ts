import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { cloudDocumentChanges, cloudDocuments } from '../src/lib/db/cloud-documents';
import { createReservation } from '../src/lib/domain/operations';
import {
  registerCustomerAccount,
  verifyUserEmailToken,
  ensureProfileForFirebaseUser,
  createQuotation,
} from '../src/lib/domain/production-ops';
import { buildSnapshot, getIntegrationStatus } from '../src/lib/api/snapshot';
import type { PermissionKey } from '../src/lib/domain/types';
import { userRecordToStaffView } from '../src/lib/domain/staff-view';
import { signCloudinaryParams, createSignedUploadTicket } from '../src/lib/cloudinary/server';
import { generateQuotationPdf } from '../src/lib/pdf/documents';
import { buildGuestWhatsAppUrl } from '../src/lib/domain/whatsapp';
import { buildTestApartments } from './helpers';

const today = '2026-11-04';

mkdirSync(path.join(process.cwd(), '.data'), { recursive: true });
const temp = mkdtempSync(path.join(process.cwd(), '.data', 'test-'));
process.env.LEMMA_DATA_DIR = temp;

test.after(() => rmSync(temp, { recursive: true, force: true }));

test('fresh databases and serverless fallback start completely clean with zero fake apartments or infrastructure leaks', async () => {
  const { getDb, ensureCloudFirestoreHydrated, runAtomicTransaction, createEmptyDatabase, dbStats } =
    await import('../src/lib/db/store');
  const { sessionToken, verifyToken } = await import('../src/lib/auth/session');

  const fresh = createEmptyDatabase(today);
  assert.equal(fresh.apartments.length, 0);
  assert.equal(fresh.guests.length, 0);
  assert.equal(fresh.reservations.length, 0);
  assert.equal(fresh.settings.tax?.registrationNumber, '');
  const settingsJson = JSON.stringify(fresh.settings);
  assert.ok(!/brevo|cloudinary|firebase|firestore|api_key|webhook_url/i.test(settingsJson));

  const names = [
    'VERCEL',
    'LEMMA_SESSION_SECRET',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_SERVICE_ACCOUNT',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.VERCEL = '1';
    delete process.env.LEMMA_SESSION_SECRET;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;

    await ensureCloudFirestoreHydrated();
    const db = getDb();
    assert.equal(db.apartments.length, 0);

    const tok = sessionToken('usr-test-1', 2);
    assert.deepEqual(verifyToken(tok), { uid: 'usr-test-1', sessionVersion: 2 });

    const beforeSeq = db.sequences.reservation;
    await runAtomicTransaction((draft) => {
      draft.sequences.reservation += 1;
    });
    assert.equal(getDb().sequences.reservation, beforeSeq + 1);

    const stats = dbStats() as Record<string, unknown>;
    assert.equal('backendMode' in stats, false);
    assert.equal('file' in stats, false);
    assert.equal('sizeBytes' in stats, false);

    const integration = getIntegrationStatus() as unknown as Record<string, unknown>;
    assert.equal('cloudinaryCloudName' in integration, false);
    assert.equal('cloudinaryUploadPreset' in integration, false);
    assert.equal('firebaseClientConfigured' in integration, false);
    assert.equal('firebaseAdminConfigured' in integration, false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Firebase Admin credential parser normalises common paste formats and rejects invalid PEMs safely', async () => {
  const {
    normalisePrivateKey,
    resolveFirebaseAdminCredentials,
    getFirebaseAdminApp,
    isFirebaseAdminConfigured,
  } = await import('../src/lib/firebase/admin');

  const samplePem =
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----';
  assert.equal(normalisePrivateKey(`"${samplePem.replace(/\n/g, '\\n')}",`), samplePem);
  assert.equal(normalisePrivateKey(Buffer.from(samplePem, 'utf8').toString('base64')), samplePem);

  const names = [
    'FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    process.env.FIREBASE_CLIENT_EMAIL =
      'firebase-adminsdk-abc@lemma-prod-123.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = samplePem;

    const resolved = resolveFirebaseAdminCredentials();
    assert.equal(resolved?.projectId, 'lemma-prod-123');
    assert.equal(getFirebaseAdminApp(), null);
    assert.equal(isFirebaseAdminConfigured(), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('document diff writes updates and deletions; unchanged bookings are not rewritten', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  db.apartments.push(...buildTestApartments());
  const before = cloudDocuments(db);
  db.apartments[0].nightlyRate += 100;
  db.apartments.splice(1, 1);
  const changes = cloudDocumentChanges(before, cloudDocuments(db));
  assert.deepEqual(
    changes.map((change) => change.path).sort(),
    ['apartments/test-apt-101', 'apartments/test-apt-102'],
  );
  assert.equal(changes.find((change) => change.path === 'apartments/test-apt-102')?.data, null);
  assert.equal(
    changes.find((change) => change.path === 'apartments/test-apt-101')?.data?.nightlyRate,
    1050,
  );
});

test('local store rolls back a failed write and serializes concurrent mutations', async () => {
  const { getDb, runAtomicTransaction } = await import('../src/lib/db/store');
  const original = getDb().sequences.reservation;
  await assert.rejects(
    () =>
      runAtomicTransaction((db) => {
        db.sequences.reservation += 200;
        throw new Error('rollback');
      }),
    /rollback/,
  );
  assert.equal(getDb().sequences.reservation, original);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      runAtomicTransaction(async (db) => {
        const old = db.sequences.reservation;
        await new Promise((resolve) => setTimeout(resolve, 2));
        db.sequences.reservation = old + 1;
      }),
    ),
  );
  assert.equal(getDb().sequences.reservation, original + 10);
});

test('an unverified guest cannot inherit another visitor’s booking just by typing their email', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  const apt = buildTestApartments()[0];
  db.apartments.push(apt);
  db.__today = today;
  const booking = createReservation(db, 'public', {
    apartmentId: apt.id,
    guest: { fullName: 'Earlier Visitor', email: 'shared@example.com', phone: '+260971234567' },
    checkIn: '2026-12-05',
    checkOut: '2026-12-08',
    guestCount: 2,
    source: 'website',
    asInquiry: true,
  });
  assert.equal(booking.status, 'inquiry');
  assert.equal(booking.userId, null);
  const { user, verificationToken } = registerCustomerAccount(db, {
    email: 'shared@example.com',
    fullName: 'Different Person',
    phoneNumber: '+260977777777',
    password: 'StrongerPass2026!',
  });
  const session = {
    uid: user.uid,
    user: userRecordToStaffView(user),
    userRecord: user,
    permissions: new Set<PermissionKey>(),
  };
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
    email: 'manager@example.com',
    fullName: 'Property Manager',
    phoneNumber: '+260977777771',
    password: 'StrongerPass2026!',
  });
  user.role = 'admin';
  assert.throws(
    () =>
      ensureProfileForFirebaseUser(
        db,
        {
          uid: 'different-firebase-uid',
          email: 'manager@example.com',
          displayName: 'Impostor',
          phoneNumber: null,
          emailVerified: false,
        },
        false,
      ),
    /belongs to another account/,
  );
  assert.equal(db.users?.length, 1);
  assert.equal(db.users?.[0].role, 'admin');
});

test('a signed upload ticket signs exactly the public ID and folder sent to Cloudinary', () => {
  const old = { key: process.env.CLOUDINARY_API_KEY, secret: process.env.CLOUDINARY_API_SECRET };
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  try {
    const ticket = createSignedUploadTicket({ category: 'apartment', apartmentId: 'test-apt-101' });
    assert.equal(ticket.configured, true);
    assert.equal(
      ticket.signature,
      signCloudinaryParams({
        folder: ticket.folder,
        public_id: ticket.publicId,
        timestamp: ticket.timestamp,
        upload_preset: ticket.uploadPreset,
      }),
    );
    assert.notEqual(
      ticket.publicId,
      createSignedUploadTicket({ category: 'apartment', apartmentId: 'test-apt-101' }).publicId,
    );
  } finally {
    if (old.key === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = old.key;
    if (old.secret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = old.secret;
  }
});

test('vector brand emblem PDF generation and Zambian WhatsApp link helper work cleanly', async () => {
  const { createEmptyDatabase } = await import('../src/lib/db/store');
  const db = createEmptyDatabase(today);
  const apt = buildTestApartments()[0];
  db.apartments.push(apt);
  const admin = registerCustomerAccount(db, {
    email: 'admin@example.com',
    fullName: 'Desk Manager',
    phoneNumber: '+260977000111',
    password: 'StrongerPass2026!',
  }).user;
  admin.role = 'admin';
  const quote = createQuotation(db, admin.uid, {
    apartmentId: apt.id,
    customerName: 'Mwila Banda',
    customerEmail: 'mwila@example.com',
    customerPhone: '0971234567',
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    guestCount: 2,
  });
  const pdfBytes = await generateQuotationPdf(quote, db.settings);
  assert.ok(pdfBytes.byteLength > 1000);
  assert.equal(Buffer.from(pdfBytes.slice(0, 4)).toString('ascii'), '%PDF');

  assert.equal(
    buildGuestWhatsAppUrl('097 123 4567', 'Hello Mwila'),
    'https://wa.me/260971234567?text=Hello%20Mwila',
  );
  assert.equal(
    buildGuestWhatsAppUrl('+260 770 112 233', 'Booking ready'),
    'https://wa.me/260770112233?text=Booking%20ready',
  );
});
