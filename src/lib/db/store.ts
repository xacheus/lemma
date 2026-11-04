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
import { computeDashboardSummary } from './summary';

/**
 * Upgrades legacy placeholder or template values stored by earlier builds so no
 * fake property details, sample apartments, or technical environment variable names
 * persist into the user interface. Operator-entered values are never overwritten.
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
  { section: 'googleBusiness', field: 'phone', from: '+260 574556207', to: DEFAULT_SETTINGS.googleBusiness!.phone },
  { section: 'googleBusiness', field: 'website', from: 'https://lemmaheights.zm', to: DEFAULT_SETTINGS.googleBusiness!.website },
];

const LEGACY_SAMPLE_IDS = new Set(['apt-studio', 'apt-one_bed', 'apt-family']);

function upgradeRenamedDefaults(db: Database) {
  for (const rule of RENAMED_DEFAULTS) {
    const section = db.settings?.[rule.section] as unknown as Record<string, unknown> | undefined;
    if (section && section[rule.field] === rule.from) section[rule.field] = rule.to;
  }

  if (db.settings?.tax?.registrationNumber === '14/220887/001') {
    db.settings.tax.registrationNumber = '';
  }

  for (const method of db.settings?.payments?.methods ?? []) {
    if (
      method.id === 'bank_transfer' &&
      [
        'Lemma Apartments — account details are confirmed by reception before any transfer is made',
        'Lemma Apartments. Account details are confirmed by reception before any transfer is made',
      ].includes(method.accountNumber)
    ) {
      method.accountNumber = '';
    }
    if (method.id === 'cash' && method.accountNumber === 'Front Office Till 1') {
      method.accountNumber = '';
    }
  }

  const notifications = db.settings?.notifications;
  if (notifications) {
    if (notifications.whatsapp) {
      notifications.whatsapp.provider = null;
      if (/WHATSAPP_ACCESS_TOKEN|Cloud API/i.test(notifications.whatsapp.note ?? '')) {
        notifications.whatsapp.note = DEFAULT_SETTINGS.notifications.whatsapp.note;
      }
    }
    if (notifications.sms) {
      notifications.sms.provider = null;
      if (/SMS_WEBHOOK_URL|SMS_API_KEY/i.test(notifications.sms.note ?? '')) {
        notifications.sms.note = DEFAULT_SETTINGS.notifications.sms.note;
      }
    }
    if (notifications.email) {
      notifications.email.provider = null;
      if (/BREVO_API_KEY|EMAIL_FROM|Brevo/i.test(notifications.email.note ?? '')) {
        notifications.email.note = DEFAULT_SETTINGS.notifications.email.note;
      }
    }
  }

  // Remove legacy auto-seeded sample stock units if they are untouched and unbooked.
  const bookedApartmentIds = new Set((db.reservations ?? []).map((r) => r.apartmentId));
  db.apartments = (db.apartments ?? []).filter((apt) => {
    if (!LEGACY_SAMPLE_IDS.has(apt.id)) return true;
    if (bookedApartmentIds.has(apt.id)) return true;
    const onlyStockPhotos = (apt.photos ?? []).every((url) => url.startsWith('/images/apartments/'));
    return !onlyStockPhotos;
  });
}

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
    bookingAccess: [],
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
  db.bookingAccess = db.bookingAccess ?? [];
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
    console.warn('[store] Primary store unavailable; using fallback dataset during cooldown:', reason);
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
        if (cloudRevision !== startedAtRevision) return;
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

const BATCH_LIMIT_MSG = 'Too many records were updated at once. Please save your changes in smaller steps.';

async function cloudTransaction<T>(
  adminDb: Firestore,
  fn: (db: Database) => Promise<T> | T,
): Promise<T> {
  const { result, committed } = await withTimeout(
    adminDb.runTransaction(
      async (tx) => {
        const db = await readCloudDatabase(adminDb, tx);
        const before = cloudDocuments(db);
        const result = await fn(db);
        db.updatedAt = new Date().toISOString();
        computeDashboardSummary(db);
        const changes = cloudDocumentChanges(before, cloudDocuments(db));
        if (changes.length > 496) {
          throw new StoreUnavailableError(BATCH_LIMIT_MSG);
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

export function getDb(): Database {
  if (getAdminFirestore() && cloudCache) {
    if (cloudCacheForDate !== businessToday()) {
      cloudCache.__today = businessToday();
    }
    return cloudCache;
  }
  return load();
}

export function getFallbackDb(): Database {
  try {
    return getDb();
  } catch {
    const today = businessToday();
    const fallback = ensureSchemaCollections(createEmptyDatabase(today));
    computeDashboardSummary(fallback);
    return fallback;
  }
}

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
          if (error instanceof StoreUnavailableError && error.message === BATCH_LIMIT_MSG) {
            throw error;
          }
          markFirestoreFallback(error);
          if (cloudHydrated) {
            throw new StoreUnavailableError();
          }
        }
      }
    }

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

/** Property record counts for management views — never exposes backend or filesystem details. */
export function dbStats() {
  const db = getDb();
  return {
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
