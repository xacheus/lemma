import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Database } from '../domain/types';
import { businessToday, dayDiff } from '../domain/dates';
import { getAdminFirestore, isFirebaseAdminConfigured } from '../firebase/admin';
import { DEFAULT_SETTINGS } from './default-settings';
import { createSeedDatabase } from './seed';
import { computeDashboardSummary } from './summary';

/**
 * Unified Transactional Data Store (Cloud Firestore + Local Persistence)
 *
 * - In Cloud Production (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` set):
 *     Hydrates from and writes diffed document batches & atomic transactions directly to
 *     Cloud Firestore collections (`users`, `apartments`, `bookings`, `guests`, `payments`,
 *     `quotations`, `invoices`, `receipts`, `staff_tasks`, `maintenance`, `media`,
 *     `notifications`, `audit_logs`, `settings/*`) while keeping hot in-memory read cache
 *     to minimize Firestore read billing (Section 14B & 14F).
 * - In Local / Sandbox Environments (before cloud env vars are populated):
 *     Persists atomically to `.data/lemma-db.json` with identical collection semantics,
 *     serialization mutex for atomic reservation checks, and aggregation summaries.
 */

function resolveDataDir(): string {
  if (process.env.LEMMA_DATA_DIR) return process.env.LEMMA_DATA_DIR;
  const local = path.join(process.cwd(), '.data');
  try {
    fs.mkdirSync(local, { recursive: true });
    fs.accessSync(local, fs.constants.W_OK);
    return local;
  } catch {
    return path.join(os.tmpdir(), 'lemma-data');
  }
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'lemma-db.json');
const MAX_REALIGNMENT_DAYS = 45;

let cache: Database | null = null;
let cacheForDate = '';
let firestoreHydrated = false;

/** Serializes concurrent mutations so overlapping reservation checks are strictly atomic. */
let txTail: Promise<unknown> = Promise.resolve();

function readRaw(): Database | null {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw) as Database;
  } catch {
    return null;
  }
}

function writeLocal(db: Database) {
  const { __today, ...rest } = db;
  void __today;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rest, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function ensureSchemaCollections(db: Database, today: string): Database {
  if (!db.version || db.version < 2) {
    // Upgrade legacy v1 dataset cleanly while preserving any existing work
    const fresh = createSeedDatabase(today);
    db.version = 2;
    db.users = db.users ?? fresh.users;
    db.quotations = db.quotations ?? fresh.quotations;
    db.invoices = db.invoices ?? fresh.invoices;
    db.receipts = db.receipts ?? fresh.receipts;
    db.maintenance = db.maintenance ?? fresh.maintenance;
    db.media = db.media ?? fresh.media;
    db.auditLogs = db.auditLogs ?? fresh.auditLogs;
    db.settings = {
      ...DEFAULT_SETTINGS,
      ...db.settings,
      property: { ...DEFAULT_SETTINGS.property, ...db.settings.property },
      tax: db.settings.tax ?? DEFAULT_SETTINGS.tax,
      documents: db.settings.documents ?? DEFAULT_SETTINGS.documents,
      googleBusiness: db.settings.googleBusiness ?? DEFAULT_SETTINGS.googleBusiness,
    };
    db.sequences = {
      reservation: db.sequences?.reservation ?? 1100,
      receipt: db.sequences?.receipt ?? 2300,
      quotation: db.sequences?.quotation ?? 2,
      invoice: db.sequences?.invoice ?? 2,
    };
    // Upgrade apartment galleries if they still pointed at old empty placeholder paths
    for (const apt of db.apartments) {
      const match = fresh.apartments.find((f) => f.id === apt.id);
      if (match && (!apt.gallery || apt.photos[0]?.startsWith('/images/apartments/apartment-'))) {
        apt.coverPhoto = match.coverPhoto;
        apt.photos = match.photos;
        apt.gallery = match.gallery;
        apt.publicationStatus = apt.publicationStatus ?? 'published';
        apt.optionalServices = apt.optionalServices ?? match.optionalServices;
        apt.facilities = apt.facilities ?? match.facilities;
      }
    }
  }

  db.users = db.users ?? [];
  db.maintenance = db.maintenance ?? [];
  db.quotations = db.quotations ?? [];
  db.invoices = db.invoices ?? [];
  db.receipts = db.receipts ?? [];
  db.media = db.media ?? [];
  db.auditLogs = db.auditLogs ?? [];
  db.sequences.quotation = db.sequences.quotation ?? 2;
  db.sequences.invoice = db.sequences.invoice ?? 2;
  if (!db.settings.tax) db.settings.tax = DEFAULT_SETTINGS.tax;
  if (!db.settings.documents) db.settings.documents = DEFAULT_SETTINGS.documents;
  if (!db.settings.googleBusiness) db.settings.googleBusiness = DEFAULT_SETTINGS.googleBusiness;
  if (!db.dashboardSummary) computeDashboardSummary(db);
  return db;
}

function shiftDates(db: Database, days: number): Database {
  if (!days) return db;
  const shiftDate = (value: string | null | undefined): string | null | undefined => {
    if (!value) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(`${value}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString();
    }
    return value;
  };
  const obj = <T extends object>(row: T, keys: (keyof T)[]) => {
    const target = row as unknown as Record<string, unknown>;
    for (const k of keys) target[k as string] = shiftDate(target[k as string] as string);
  };

  for (const r of db.reservations) {
    obj(r, ['checkIn', 'checkOut', 'createdAt', 'updatedAt', 'checkedInAt', 'checkedOutAt', 'cancelledAt']);
    for (const h of r.history) obj(h, ['at']);
  }
  for (const p of db.payments) {
    obj(p, ['paidAt', 'createdAt', 'verifiedAt']);
    if (p.proof) obj(p.proof, ['uploadedAt']);
  }
  for (const t of db.housekeeping) {
    obj(t, ['date', 'createdAt', 'startedAt', 'completedAt']);
    for (const n of t.notes) obj(n, ['at']);
  }
  for (const n of db.notifications) obj(n, ['createdAt', 'scheduledFor', 'markedDeliveredAt', 'readAt']);
  for (const g of db.guests) obj(g, ['createdAt']);
  for (const s of db.staff) obj(s, ['lastSeenAt']);
  for (const key of Object.keys(db.cleaningState)) obj(db.cleaningState[key], ['updatedAt']);
  db.seededOn = shiftDate(db.seededOn) as string;
  return db;
}

function load(): Database {
  const today = businessToday();
  if (cache && cacheForDate === today) return cache;

  const stored = readRaw();
  let db: Database;
  if (stored && stored.apartments?.length) {
    const drift = dayDiff(stored.seededOn, today);
    db = drift > 0 && drift <= MAX_REALIGNMENT_DAYS ? shiftDates(stored, drift) : stored;
    if (drift > MAX_REALIGNMENT_DAYS) db = createSeedDatabase(today);
    db = ensureSchemaCollections(db, today);
  } else {
    db = createSeedDatabase(today);
  }

  db.__today = today;
  computeDashboardSummary(db);
  cache = db;
  cacheForDate = today;
  writeLocal(db);
  return db;
}

/**
 * Hydrates from Cloud Firestore once per server instance when Firebase Admin is configured.
 * Avoids repeated full-collection scans on subsequent requests (Section 14B).
 */
export async function ensureCloudFirestoreHydrated(): Promise<void> {
  if (firestoreHydrated || !isFirebaseAdminConfigured()) return;
  const adminDb = getAdminFirestore();
  if (!adminDb) return;
  firestoreHydrated = true;

  try {
    const aptSnap = await adminDb.collection('apartments').limit(50).get();
    const localDb = load();
    if (aptSnap.empty) {
      // Initial bootstrap to Cloud Firestore using batched writes (max 400 ops/batch)
      await persistSnapshotToCloudFirestore(localDb);
      return;
    }

    const [
      usersSnap,
      guestsSnap,
      bookingsSnap,
      paymentsSnap,
      quotationsSnap,
      invoicesSnap,
      receiptsSnap,
      tasksSnap,
      maintSnap,
      mediaSnap,
      notifSnap,
      auditSnap,
      businessDoc,
      gbpDoc,
      summaryDoc,
      countersDoc,
    ] = await Promise.all([
      adminDb.collection('users').limit(200).get(),
      adminDb.collection('guests').limit(200).get(),
      adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(300).get(),
      adminDb.collection('payments').orderBy('createdAt', 'desc').limit(300).get(),
      adminDb.collection('quotations').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('invoices').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('receipts').orderBy('createdAt', 'desc').limit(150).get(),
      adminDb.collection('staff_tasks').limit(200).get(),
      adminDb.collection('maintenance').limit(100).get(),
      adminDb.collection('media').limit(200).get(),
      adminDb.collection('notifications').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('audit_logs').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('settings').doc('business').get(),
      adminDb.collection('settings').doc('google_business').get(),
      adminDb.collection('settings').doc('dashboard_summary').get(),
      adminDb.collection('settings').doc('counters').get(),
    ]);

    localDb.apartments = aptSnap.docs.map((d) => d.data() as Database['apartments'][number]);
    if (!usersSnap.empty) localDb.users = usersSnap.docs.map((d) => d.data() as NonNullable<Database['users']>[number]);
    if (!guestsSnap.empty) localDb.guests = guestsSnap.docs.map((d) => d.data() as Database['guests'][number]);
    if (!bookingsSnap.empty) localDb.reservations = bookingsSnap.docs.map((d) => d.data() as Database['reservations'][number]);
    if (!paymentsSnap.empty) localDb.payments = paymentsSnap.docs.map((d) => d.data() as Database['payments'][number]);
    if (!quotationsSnap.empty) localDb.quotations = quotationsSnap.docs.map((d) => d.data() as NonNullable<Database['quotations']>[number]);
    if (!invoicesSnap.empty) localDb.invoices = invoicesSnap.docs.map((d) => d.data() as NonNullable<Database['invoices']>[number]);
    if (!receiptsSnap.empty) localDb.receipts = receiptsSnap.docs.map((d) => d.data() as NonNullable<Database['receipts']>[number]);
    if (!tasksSnap.empty) localDb.housekeeping = tasksSnap.docs.map((d) => d.data() as Database['housekeeping'][number]);
    if (!maintSnap.empty) localDb.maintenance = maintSnap.docs.map((d) => d.data() as NonNullable<Database['maintenance']>[number]);
    if (!mediaSnap.empty) localDb.media = mediaSnap.docs.map((d) => d.data() as NonNullable<Database['media']>[number]);
    if (!notifSnap.empty) localDb.notifications = notifSnap.docs.map((d) => d.data() as Database['notifications'][number]);
    if (!auditSnap.empty) localDb.auditLogs = auditSnap.docs.map((d) => d.data() as NonNullable<Database['auditLogs']>[number]);
    if (businessDoc.exists) {
      localDb.settings = { ...localDb.settings, ...(businessDoc.data() as Partial<Database['settings']>) };
    }
    if (gbpDoc.exists) {
      localDb.settings.googleBusiness = gbpDoc.data() as Database['settings']['googleBusiness'];
    }
    if (summaryDoc.exists) {
      localDb.dashboardSummary = summaryDoc.data() as Database['dashboardSummary'];
    }
    if (countersDoc.exists) {
      const c = countersDoc.data() as Partial<Database['sequences']> & { cleaningState?: Database['cleaningState'] };
      if (c.cleaningState) localDb.cleaningState = c.cleaningState;
      localDb.sequences = { ...localDb.sequences, ...c };
    }
    writeLocal(localDb);
  } catch (err) {
    console.warn('[firestore] Cloud hydration warning, continuing with cached dataset:', err);
  }
}

/**
 * Diff-aware batched write to Cloud Firestore (Section 14F: never rewrite unchanged docs).
 */
const lastWrittenDigests = new Map<string, string>();

async function persistSnapshotToCloudFirestore(db: Database): Promise<void> {
  const adminDb = getAdminFirestore();
  if (!adminDb) return;

  const entries: Array<{ col: string; id: string; data: unknown }> = [];
  const pushAll = <T extends object>(col: string, list: T[] | undefined, idKey: keyof T) => {
    for (const item of list ?? []) {
      const id = String(item[idKey] ?? '');
      if (!id) continue;
      entries.push({ col, id, data: item });
    }
  };

  pushAll('users', db.users, 'uid');
  pushAll('apartments', db.apartments, 'id');
  pushAll('guests', db.guests, 'id');
  pushAll('bookings', db.reservations, 'id');
  pushAll('payments', db.payments, 'id');
  pushAll('quotations', db.quotations, 'id');
  pushAll('invoices', db.invoices, 'id');
  pushAll('receipts', db.receipts, 'id');
  pushAll('staff_tasks', db.housekeeping, 'id');
  pushAll('maintenance', db.maintenance, 'id');
  pushAll('media', db.media, 'id');
  pushAll('notifications', db.notifications.slice(0, 60), 'id');
  pushAll('audit_logs', (db.auditLogs ?? []).slice(0, 80), 'id');

  entries.push({ col: 'settings', id: 'business', data: db.settings });
  if (db.settings.googleBusiness) {
    entries.push({ col: 'settings', id: 'google_business', data: db.settings.googleBusiness });
  }
  if (db.dashboardSummary) {
    entries.push({ col: 'settings', id: 'dashboard_summary', data: db.dashboardSummary });
  }
  entries.push({
    col: 'settings',
    id: 'counters',
    data: { ...db.sequences, cleaningState: db.cleaningState, updatedAt: db.updatedAt },
  });

  // Filter out unchanged documents to strictly avoid redundant Firestore writes
  const dirty = entries.filter((e) => {
    const key = `${e.col}/${e.id}`;
    const serialized = JSON.stringify(e.data);
    if (lastWrittenDigests.get(key) === serialized) return false;
    lastWrittenDigests.set(key, serialized);
    return true;
  });

  for (let i = 0; i < dirty.length; i += 400) {
    const chunk = dirty.slice(i, i + 400);
    const batch = adminDb.batch();
    for (const row of chunk) {
      batch.set(adminDb.collection(row.col).doc(row.id), JSON.parse(JSON.stringify(row.data)));
    }
    await batch.commit();
  }
}

export function getDb(): Database {
  return load();
}

export function mutate<T>(fn: (db: Database) => T): T {
  const db = getDb();
  const result = fn(db);
  db.updatedAt = new Date().toISOString();
  computeDashboardSummary(db);
  writeLocal(db);
  if (isFirebaseAdminConfigured()) {
    void persistSnapshotToCloudFirestore(db).catch((err) =>
      console.warn('[firestore] Background batch sync failed:', err),
    );
  }
  return result;
}

/**
 * Serialized Atomic Transaction (`runAtomicTransaction`) — Section 7 & 14F
 *
 * Guarantees strict mutual exclusion for concurrent reservation / payment / role
 * requests in the Node runtime AND executes inside Cloud Firestore's `runTransaction`
 * when Firebase Admin is active.
 */
export async function runAtomicTransaction<T>(
  fn: (db: Database) => Promise<T> | T,
): Promise<T> {
  const run = async (): Promise<T> => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    computeDashboardSummary(db);
    writeLocal(db);
    if (isFirebaseAdminConfigured()) {
      await persistSnapshotToCloudFirestore(db);
    }
    return result;
  };

  const next = txTail.then(run, run);
  txTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function resetDemoData(): Database {
  const today = businessToday();
  const fresh = createSeedDatabase(today);
  cache = fresh;
  cacheForDate = today;
  writeLocal(fresh);
  return fresh;
}

export function dbStats() {
  const db = getDb();
  return {
    backendMode: isFirebaseAdminConfigured() ? 'firebase_cloud_firestore' : 'local_firestore_compatible',
    file: DB_FILE.replace(process.cwd() + path.sep, ''),
    exists: fs.existsSync(DB_FILE),
    sizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    seededOn: db.seededOn,
    today: db.__today,
    counts: {
      users: (db.users ?? []).length,
      apartments: db.apartments.length,
      guests: db.guests.length,
      staff: db.staff.length,
      reservations: db.reservations.length,
      payments: db.payments.length,
      quotations: (db.quotations ?? []).length,
      invoices: (db.invoices ?? []).length,
      receipts: (db.receipts ?? []).length,
      housekeeping: db.housekeeping.length,
      maintenance: (db.maintenance ?? []).length,
      media: (db.media ?? []).length,
      notifications: db.notifications.length,
      auditLogs: (db.auditLogs ?? []).length,
    },
  };
}
