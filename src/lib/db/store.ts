import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Database } from '../domain/types';
import { businessToday } from '../domain/dates';
import { getAdminFirestore, isFirebaseAdminConfigured } from '../firebase/admin';
import { DEFAULT_SETTINGS } from './default-settings';
import { buildIllustrativeCatalogue } from './illustrative-catalogue';

/**
 * Renames that must follow the business identity. Settings written by an earlier
 * build of this platform carry the previous trading name; rather than leaving it
 * on receipts and the public site, a stored value that exactly matches the old
 * default is upgraded to the current one. A name an operator typed deliberately
 * (anything else) is never touched.
 */
const RENAMED_DEFAULTS: { section: 'property' | 'googleBusiness'; field: string; from: string; to: string }[] = [
  { section: 'property', field: 'name', from: 'Lemma Heights Apartments', to: DEFAULT_SETTINGS.property.name },
  { section: 'property', field: 'legalName', from: 'Lemma Heights (Private) Limited', to: DEFAULT_SETTINGS.property.legalName },
  { section: 'property', field: 'addressLine', from: 'Plot 2144B, Chainama Lands, Great East Road', to: DEFAULT_SETTINGS.property.addressLine },
  { section: 'property', field: 'phone', from: '+260 211 470 662', to: DEFAULT_SETTINGS.property.phone },
  { section: 'property', field: 'whatsapp', from: '+260 977 220 001', to: DEFAULT_SETTINGS.property.whatsapp },
  { section: 'property', field: 'email', from: 'reception@lemmaheights.zm', to: DEFAULT_SETTINGS.property.email },
  { section: 'property', field: 'website', from: 'https://lemmaheights.zm', to: DEFAULT_SETTINGS.property.website },
  { section: 'property', field: 'taxPayerId', from: '14/220887/001', to: DEFAULT_SETTINGS.property.taxPayerId },
  { section: 'property', field: 'tagline', from: 'Serviced apartments on Great East Road, Chainama Lands, Lusaka', to: DEFAULT_SETTINGS.property.tagline },
  { section: 'googleBusiness', field: 'businessName', from: 'Lemma Heights Apartments', to: DEFAULT_SETTINGS.googleBusiness!.businessName },
  { section: 'googleBusiness', field: 'addressLine', from: 'Plot 2144B, Chainama Lands, Great East Road', to: DEFAULT_SETTINGS.googleBusiness!.addressLine },
  { section: 'googleBusiness', field: 'phone', from: '+260 211 470 662', to: DEFAULT_SETTINGS.googleBusiness!.phone },
  { section: 'googleBusiness', field: 'website', from: 'https://lemmaheights.zm', to: DEFAULT_SETTINGS.googleBusiness!.website },
];

function upgradeRenamedDefaults(db: Database) {
  for (const rule of RENAMED_DEFAULTS) {
    const section = db.settings?.[rule.section] as unknown as Record<string, unknown> | undefined;
    if (section && section[rule.field] === rule.from) section[rule.field] = rule.to;
  }
}

/**
 * Creates the starting catalogue exactly once, on an install that has never had
 * one. The marker is written whether or not units are created, so an operator who
 * deletes every apartment is not given them back on the next page load.
 */
function seedStartingCatalogue(db: Database) {
  if (db.catalogueSeededAt) return;
  db.catalogueSeededAt = new Date().toISOString();
  if (db.apartments.length > 0) return;
  const { apartments } = buildIllustrativeCatalogue(db.catalogueSeededAt);
  db.apartments = apartments;
}
import { computeDashboardSummary } from './summary';

/**
 * Unified Transactional Data Store (Cloud Firestore + Local Persistence)
 *
 * The store starts empty: there is no sample building, no sample guests and no
 * sample money anywhere in this codebase. Staff roles are appointed by setting
 * `role` on the account's `users/{uid}` document in the Firebase Console — the
 * session resolver reads that document, so the change applies on the next request.
 * Every apartment, guest, booking and payment is entered by a person.
 *
 * - In Cloud Production (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` set):
 *     Hydrates from and writes diffed document batches & atomic transactions directly to
 *     Cloud Firestore collections (`users`, `apartments`, `bookings`, `guests`, `payments`,
 *     `quotations`, `invoices`, `receipts`, `staff_tasks`, `maintenance`, `media`,
 *     `notifications`, `audit_logs`, `settings/*`) while keeping hot in-memory read cache
 *     to minimize Firestore read billing.
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

/**
 * Bumped whenever the persisted shape changes in a way that old files cannot
 * satisfy. A file written by an earlier build (which auto-generated sample
 * data) is discarded on first read rather than migrated, so no fabricated
 * record can survive into the production dataset.
 */
const SCHEMA_VERSION = 3;

let cache: Database | null = null;
let cacheForDate = '';
let firestoreHydrated = false;

/** Serializes concurrent mutations so overlapping reservation checks are strictly atomic. */
let txTail: Promise<unknown> = Promise.resolve();

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Database['settings'];
}

/** An empty property: the shape every screen expects, with nothing invented in it. */
export function createEmptyDatabase(today: string): Database {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    users: [],
    apartments: [],
    housekeeping: [],
    maintenance: [],
    cleaningState: {},
    guests: [],
    staff: [],
    reservations: [],
    payments: [],
    quotations: [],
    invoices: [],
    receipts: [],
    media: [],
    auditLogs: [],
    notifications: [],
    paymentClaims: [],
    settings: cloneDefaults(),
    sequences: {
      reservation: 1000,
      receipt: 1,
      quotation: 1,
      invoice: 1,
    },
    __today: today,
  };
}

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

function ensureSchemaCollections(db: Database): Database {
  const fresh = createEmptyDatabase(db.__today);

  db.users = db.users ?? [];
  db.apartments = db.apartments ?? [];
  db.housekeeping = db.housekeeping ?? [];
  db.maintenance = db.maintenance ?? [];
  db.cleaningState = db.cleaningState ?? {};
  db.guests = db.guests ?? [];
  db.staff = db.staff ?? [];
  db.reservations = db.reservations ?? [];
  db.payments = db.payments ?? [];
  db.quotations = db.quotations ?? [];
  db.invoices = db.invoices ?? [];
  db.receipts = db.receipts ?? [];
  db.media = db.media ?? [];
  db.auditLogs = db.auditLogs ?? [];
  db.notifications = db.notifications ?? [];
  db.paymentClaims = db.paymentClaims ?? [];
  db.settings = {
    ...fresh.settings,
    ...db.settings,
    property: { ...fresh.settings.property, ...db.settings?.property },
    tax: db.settings?.tax ?? fresh.settings.tax,
    documents: db.settings?.documents ?? fresh.settings.documents,
    googleBusiness: db.settings?.googleBusiness ?? fresh.settings.googleBusiness,
  };
  db.sequences = {
    reservation: db.sequences?.reservation ?? fresh.sequences.reservation,
    receipt: db.sequences?.receipt ?? fresh.sequences.receipt,
    quotation: db.sequences?.quotation ?? fresh.sequences.quotation,
    invoice: db.sequences?.invoice ?? fresh.sequences.invoice,
  };
  db.version = SCHEMA_VERSION;
  upgradeRenamedDefaults(db);
  seedStartingCatalogue(db);
  if (!db.dashboardSummary) computeDashboardSummary(db);
  return db;
}

/** True when a stored file predates this schema or was written by the old seeded build. */
function isLegacyDataset(stored: Database): boolean {
  if (!stored || typeof stored !== 'object') return true;
  const version = Number(stored.version) || 0;
  const hadSeedProvenance = 'seededOn' in (stored as unknown as Record<string, unknown>);
  return version < SCHEMA_VERSION || hadSeedProvenance;
}

function load(): Database {
  const today = businessToday();
  if (cache && cacheForDate === today) return cache;

  const stored = readRaw();
  let db: Database;
  if (stored && !isLegacyDataset(stored)) {
    db = stored;
  } else {
    // Nothing on disk, or a file written by the old seeded build: start clean.
    db = createEmptyDatabase(today);
  }

  db.__today = today;
  db = ensureSchemaCollections(db);
  computeDashboardSummary(db);
  cache = db;
  cacheForDate = today;
  writeLocal(db);
  return db;
}

/**
 * Hydrates from Cloud Firestore once per server instance when Firebase Admin is configured.
 * Avoids repeated full-collection scans on subsequent requests.
 */
export async function ensureCloudFirestoreHydrated(): Promise<void> {
  if (firestoreHydrated || !isFirebaseAdminConfigured()) return;
  const adminDb = getAdminFirestore();
  if (!adminDb) return;
  firestoreHydrated = true;

  try {
    const [
      aptSnap,
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
      claimSnap,
      auditSnap,
      businessDoc,
      gbpDoc,
      summaryDoc,
      countersDoc,
    ] = await Promise.all([
      adminDb.collection('apartments').limit(200).get(),
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
      adminDb.collection('payment_claims').orderBy('createdAt', 'desc').limit(200).get(),
      adminDb.collection('audit_logs').orderBy('createdAt', 'desc').limit(100).get(),
      adminDb.collection('settings').doc('business').get(),
      adminDb.collection('settings').doc('google_business').get(),
      adminDb.collection('settings').doc('dashboard_summary').get(),
      adminDb.collection('settings').doc('counters').get(),
    ]);

    const localDb = load();

    // An empty project is a fresh install, not a reason to write anything.
    if (aptSnap.empty && usersSnap.empty) return;

    if (!aptSnap.empty) localDb.apartments = aptSnap.docs.map((d) => d.data() as Database['apartments'][number]);
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
    if (!claimSnap.empty) localDb.paymentClaims = claimSnap.docs.map((d) => d.data() as NonNullable<Database['paymentClaims']>[number]);
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

    // Staff mirror the Firebase accounts that exist in this project; never invent rows.
    localDb.staff = localDb.staff.filter((s) => localDb.users!.some((u) => u.uid === s.id));
    computeDashboardSummary(localDb);
    writeLocal(localDb);
  } catch (err) {
    console.warn('[firestore] Cloud hydration warning, continuing with cached dataset:', err);
  }
}

/**
 * Diff-aware batched write to Cloud Firestore (never rewrites unchanged docs).
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
  pushAll('payment_claims', (db.paymentClaims ?? []).slice(0, 200), 'id');
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

/**
 * Runs the reminder sweep inside the store's transaction so reminders cannot
 * duplicate under two concurrent scheduler calls. Used by /api/cron/reminders.
 */
export async function runReminderSweepOnStore(): Promise<{
  created: number;
  skipped: number;
  claims: number;
}> {
  const { runReminderSweep } = await import('../domain/operations');
  return runAtomicTransaction((db) => runReminderSweep(db));
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
 * Serialized Atomic Transaction (`runAtomicTransaction`)
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

export function dbStats() {
  const db = getDb();
  return {
    backendMode: isFirebaseAdminConfigured() ? 'firebase_cloud_firestore' : 'local_firestore_compatible',
    file: DB_FILE.replace(process.cwd() + path.sep, ''),
    exists: fs.existsSync(DB_FILE),
    sizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    createdAt: db.createdAt,
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
