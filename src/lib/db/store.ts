import fs from 'node:fs';
import { ZodError } from 'zod';
import os from 'node:os';
import path from 'node:path';
import type { Database } from '../domain/types';
import { businessToday } from '../domain/dates';
import { getAdminFirestore } from '../firebase/admin';
import type { Firestore, Transaction, QuerySnapshot, DocumentSnapshot } from 'firebase-admin/firestore';
import { cloudDocumentChanges, CLOUD_COLLECTIONS, cloudDocuments } from './cloud-documents';
import { userRecordToStaffView } from '../domain/staff-view';
import { DEFAULT_SETTINGS } from './default-settings';
import { buildStartingCatalogue } from './starting-catalogue';
import { computeDashboardSummary } from './summary';

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
  {
    section: 'property',
    field: 'tagline',
    from: 'Furnished apartments at Barlaston Park, Lusaka — booked night by night.',
    to: DEFAULT_SETTINGS.property.tagline,
  },
  {
    section: 'property',
    field: 'receptionHours',
    from: 'Daily, 07:00 – 21:00. Late check-in by arrangement on WhatsApp.',
    to: DEFAULT_SETTINGS.property.receptionHours,
  },
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

  const methods = db.settings?.payments?.methods;
  if (Array.isArray(methods)) {
    for (const method of methods) {
      if (
        method?.id === 'bank_transfer' &&
        method.accountNumber ===
          'Lemma Apartments — account details are confirmed by reception before any transfer is made'
      ) {
        method.accountNumber =
          'Lemma Apartments. Account details are confirmed by reception before any transfer is made';
      }
    }
  }
}

/**
 * Seeds the three labelled starter apartments exactly once on a brand-new store.
 * Once `catalogueSeededAt` is recorded, deleting units in Admin never recreates them.
 */
function seedStartingCatalogue(db: Database) {
  if (db.catalogueSeededAt) return;
  db.catalogueSeededAt = new Date().toISOString();
  if (db.apartments.length === 0) {
    db.apartments = buildStartingCatalogue(db.catalogueSeededAt).apartments;
  }
}

/** Expand untouched sample galleries without overwriting real owner uploads. */
function upgradeRepresentativePhotos(db: Database) {
  const starting = buildStartingCatalogue(db.createdAt).apartments;
  for (const original of starting) {
    const existing = db.apartments.find((apt) => apt.id === original.id);
    if (!existing || !existing.gallery?.length || !existing.photos?.length) continue;
    if (
      !existing.gallery.every(
        (photo) =>
          photo.id.startsWith(`${original.id.slice(4)}-ph-`) &&
          photo.url.startsWith('/images/apartments/'),
      )
    ) {
      continue;
    }
    if (!existing.photos.every((url) => url.startsWith('/images/apartments/'))) continue;
    const urls = new Set(existing.gallery.map((g) => g.url));
    const additions = original.gallery?.filter((g) => !urls.has(g.url)) ?? [];
    if (additions.length === 0) continue;
    existing.gallery.push(
      ...additions.map((g, index) => ({
        ...g,
        order: existing.gallery!.length + index,
        isCover: false,
      })),
    );
    existing.photos = existing.gallery.map((g) => g.url);
  }
}

/**
 * Unified Transactional Data Store (Cloud Firestore + Local Fallback Persistence)
 *
 * - When Cloud Firestore is configured and reachable: Firestore is authoritative,
 *   mutations execute inside `adminDb.runTransaction()`, and reads refresh regularly.
 * - When Cloud Firestore is not yet configured (local dev, preview builds, or Vercel
 *   deployments before Firebase Admin credentials are added) or cannot be reached:
 *   falls back cleanly to an atomic JSON store (`.data/` or `os.tmpdir()/lemma-data`)
 *   with bounded timeouts and a 30s cooldown so pages and booking enquiries keep working.
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

function dbFilePath(): string {
  return path.join(resolveDataDir(), 'lemma-db.json');
}

const SCHEMA_VERSION = 3;

let localCache: Database | null = null;
let localCacheForDate = '';
let localCacheFile = '';

let cloudCache: Database | null = null;
let cloudCacheForDate = '';
let cloudHydrated = false;

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

function readRaw(file: string): Database | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as Database;
  } catch {
    return null;
  }
}

function writeLocal(db: Database) {
  const { __today, ...rest } = db;
  void __today;
  const file = dbFilePath();
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rest, null, 2));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.warn('[store] Could not persist local database snapshot:', error);
  }
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
  const file = dbFilePath();
  if (localCache && localCacheForDate === today && localCacheFile === file) {
    return localCache;
  }

  const stored = readRaw(file);
  let db: Database;
  if (stored && !isLegacyDataset(stored)) {
    db = stored;
  } else {
    db = createEmptyDatabase(today);
  }

  db.__today = today;
  db = ensureSchemaCollections(db);
  seedStartingCatalogue(db);
  upgradeRepresentativePhotos(db);
  computeDashboardSummary(db);
  localCache = db;
  localCacheForDate = today;
  localCacheFile = file;
  writeLocal(db);
  return db;
}

export class StoreUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'storage_unavailable';
  readonly details?: never;
  constructor(message = 'Our booking records are temporarily unavailable. Please try again shortly.') {
    super(message);
  }
}

const CLOUD_READ_TIMEOUT_MS = 4_000;
const CLOUD_TX_TIMEOUT_MS = 6_000;
const CLOUD_CACHE_MS = 3_000;
const FIRESTORE_COOLDOWN_MS = 30_000;

let lastCloudRefresh = 0;
let cloudRevision = 0;
let hydrateInFlight: Promise<void> | null = null;
let firestoreCooldownUntil = 0;
let lastFallbackWarnAt = 0;

export function markFirestoreFallback(reason?: unknown): void {
  firestoreCooldownUntil = Date.now() + FIRESTORE_COOLDOWN_MS;
  if (Date.now() - lastFallbackWarnAt > 30_000) {
    console.warn('[firestore] Cloud store unavailable; using fallback dataset during cooldown:', reason);
    lastFallbackWarnAt = Date.now();
  }
}

export function isCloudStoreActive(): boolean {
  return Boolean(getAdminFirestore()) && cloudHydrated && Date.now() >= firestoreCooldownUntil;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StoreUnavailableError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Reads ALL rows (including empty collections); a deleted row must not reappear. */
async function readCloudDatabase(adminDb: Firestore, tx?: Transaction): Promise<Database> {
  const collectionReads = CLOUD_COLLECTIONS.map(({ collection }) => {
    const ref = adminDb.collection(collection);
    return tx ? tx.get(ref) : ref.get();
  });
  const docRef = (id: string) => adminDb.collection('settings').doc(id);
  const documentReads = ['business', 'google_business', 'counters'].map((id) => {
    const ref = docRef(id);
    return tx ? tx.get(ref) : ref.get();
  });
  const [collectionSnaps, documentSnaps] = await Promise.all([
    Promise.all(collectionReads),
    Promise.all(documentReads),
  ]);
  const [business, googleBusiness, counters] = documentSnaps as DocumentSnapshot[];
  const counterData = counters.data() as
    | (Partial<Database['sequences']> & {
        cleaningState?: Database['cleaningState'];
        catalogueSeededAt?: string | null;
        createdAt?: string;
        updatedAt?: string;
      })
    | undefined;
  const db = createEmptyDatabase(businessToday());
  for (let i = 0; i < CLOUD_COLLECTIONS.length; i += 1) {
    const { field, key } = CLOUD_COLLECTIONS[i];
    (db as unknown as Record<string, unknown>)[field] = (
      collectionSnaps[i] as QuerySnapshot
    ).docs.map((doc) => ({
      ...doc.data(),
      [key]: doc.id,
    }));
  }
  db.settings = business.exists
    ? { ...db.settings, ...(business.data() as Partial<Database['settings']>) }
    : db.settings;
  if (googleBusiness.exists) {
    db.settings.googleBusiness = googleBusiness.data() as Database['settings']['googleBusiness'];
  }
  db.sequences = {
    reservation: counterData?.reservation ?? db.sequences.reservation,
    receipt: counterData?.receipt ?? db.sequences.receipt,
    quotation: counterData?.quotation ?? db.sequences.quotation,
    invoice: counterData?.invoice ?? db.sequences.invoice,
  };
  db.cleaningState = counterData?.cleaningState ?? {};
  db.createdAt = counterData?.createdAt ?? db.createdAt;
  db.updatedAt = counterData?.updatedAt ?? db.updatedAt;
  if (counterData?.catalogueSeededAt) {
    db.catalogueSeededAt = counterData.catalogueSeededAt;
  } else if (db.apartments.length > 0) {
    db.catalogueSeededAt = db.createdAt;
  } else if (!counters.exists && !business.exists) {
    // Brand-new, completely uninitialised cloud database: populate the labelled starter units once.
    seedStartingCatalogue(db);
  }
  db.staff = (db.users ?? [])
    .filter((user) => user.role !== 'guest')
    .map((user) => ({ ...userRecordToStaffView(user), passwordHash: user.passwordHash }));
  ensureSchemaCollections(db);
  computeDashboardSummary(db);
  return db;
}

export async function ensureCloudFirestoreHydrated(force = false): Promise<void> {
  const adminDb = getAdminFirestore();
  if (!adminDb) {
    cloudHydrated = false;
    return;
  }
  if (!force && Date.now() < firestoreCooldownUntil) {
    return;
  }
  if (
    !force &&
    cloudHydrated &&
    cloudCache &&
    cloudCacheForDate === businessToday() &&
    Date.now() - lastCloudRefresh < CLOUD_CACHE_MS
  ) {
    return;
  }
  if (!hydrateInFlight) {
    hydrateInFlight = (async () => {
      const startedAtRevision = cloudRevision;
      try {
        const loaded = await withTimeout(readCloudDatabase(adminDb), CLOUD_READ_TIMEOUT_MS);
        // A commit may have finished after this read began. Never replace the
        // confirmed post-write cache with an older read from another request.
        if (cloudRevision !== startedAtRevision) return;
        upgradeRepresentativePhotos(loaded);
        computeDashboardSummary(loaded);
        cloudCache = loaded;
        cloudCacheForDate = loaded.__today;
        cloudHydrated = true;
        firestoreCooldownUntil = 0;
        lastCloudRefresh = Date.now();
      } catch (error) {
        markFirestoreFallback(error);
      }
    })().finally(() => {
      hydrateInFlight = null;
    });
  }
  await hydrateInFlight;
}

/** The one place that can commit cloud changes, deletions and booking counters. */
async function cloudTransaction<T>(
  adminDb: Firestore,
  fn: (db: Database) => Promise<T> | T,
): Promise<T> {
  const { result, committed } = await withTimeout(
    adminDb.runTransaction(
      async (tx) => {
        const db = await readCloudDatabase(adminDb, tx);
        const before = cloudDocuments(db);
        upgradeRepresentativePhotos(db);
        const result = await fn(db);
        db.updatedAt = new Date().toISOString();
        computeDashboardSummary(db);
        const changes = cloudDocumentChanges(before, cloudDocuments(db));
        // Firestore caps a transaction at 500 document writes. Fail BEFORE committing,
        // rather than silently dropping the rest or splitting an atomic booking.
        if (changes.length > 496) {
          throw new StoreUnavailableError('This operation exceeds the cloud transaction write limit.');
        }
        for (const change of changes) {
          const ref = adminDb.doc(change.path);
          if (change.data) tx.set(ref, change.data);
          else tx.delete(ref);
        }
        tx.set(
          adminDb.collection('settings').doc('dashboard_summary'),
          JSON.parse(JSON.stringify(db.dashboardSummary)),
        );
        // Every writer touches counters: concurrent writers retry with a fresh snapshot
        // even if they would otherwise have changed different documents.
        tx.set(adminDb.collection('settings').doc('counters'), {
          ...db.sequences,
          cleaningState: db.cleaningState,
          catalogueSeededAt: db.catalogueSeededAt ?? null,
          createdAt: db.createdAt,
          updatedAt: db.updatedAt,
        });
        return { result, committed: db };
      },
      { maxAttempts: 3 },
    ),
    CLOUD_TX_TIMEOUT_MS,
  );
  cloudRevision += 1;
  cloudCache = committed;
  cloudCacheForDate = committed.__today;
  cloudHydrated = true;
  firestoreCooldownUntil = 0;
  lastCloudRefresh = Date.now();
  return result;
}

/** Runs on the scheduler through the same cross-instance atomic write path. */
export async function runReminderSweepOnStore(): Promise<{
  created: number;
  skipped: number;
  claims: number;
}> {
  const { runReminderSweep } = await import('../domain/operations');
  return runAtomicTransaction((db) => runReminderSweep(db));
}

function isDomainOrValidationError(error: unknown): boolean {
  if (error instanceof ZodError) return true;
  if (error instanceof StoreUnavailableError) return false;
  if (error instanceof Error && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) && status >= 400 && status < 500;
  }
  return false;
}

/** Returns the active dataset (Cloud Firestore when connected, local store otherwise). */
export function getDb(): Database {
  if (getAdminFirestore() && cloudCache) {
    if (cloudCacheForDate !== businessToday()) {
      cloudCache.__today = businessToday();
    }
    return cloudCache;
  }
  return load();
}

/** Guaranteed non-throwing fallback database for public read surfaces. */
export function getFallbackDb(): Database {
  try {
    return getDb();
  } catch {
    const today = businessToday();
    const fallback = ensureSchemaCollections(createEmptyDatabase(today));
    seedStartingCatalogue(fallback);
    upgradeRepresentativePhotos(fallback);
    computeDashboardSummary(fallback);
    return fallback;
  }
}

/** All mutations are serialized locally and transactional across cloud instances. */
export async function runAtomicTransaction<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const run = async (): Promise<T> => {
    const adminDb = getAdminFirestore();
    if (adminDb && Date.now() >= firestoreCooldownUntil) {
      await ensureCloudFirestoreHydrated();
      if (Date.now() >= firestoreCooldownUntil) {
        try {
          return await cloudTransaction(adminDb, fn);
        } catch (error) {
          if (isDomainOrValidationError(error)) throw error;
          if (
            error instanceof StoreUnavailableError &&
            error.message.includes('transaction write limit')
          ) {
            throw error;
          }
          markFirestoreFallback(error);
          // If a real cloud database was already active in this process, fail closed on
          // a transient write outage rather than silently writing to ephemeral disk.
          if (cloudHydrated) {
            throw new StoreUnavailableError();
          }
        }
      }
    }

    // Local / fallback atomic path: do not alter the cached object until `fn` succeeds.
    const db = JSON.parse(JSON.stringify(load())) as Database;
    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    computeDashboardSummary(db);
    writeLocal(db);
    localCache = db;
    localCacheForDate = db.__today;
    localCacheFile = dbFilePath();
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
  const cloud = isCloudStoreActive();
  const file = dbFilePath();
  return {
    backendMode: cloud ? 'firebase_cloud_firestore' : 'local',
    file: cloud ? '' : file.replace(process.cwd() + path.sep, ''),
    exists: cloud || fs.existsSync(file),
    sizeBytes: !cloud && fs.existsSync(file) ? fs.statSync(file).size : 0,
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
