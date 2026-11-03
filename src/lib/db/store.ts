import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Database } from '../domain/types';
import { businessToday, dayDiff } from '../domain/dates';
import { createSeedDatabase } from './seed';

/**
 * File-backed demo database.
 *
 * The brief asks for persistent demo data without a hosted backend, so the whole
 * ledger is kept as JSON next to the project and mutated synchronously through
 * `mutate()`. Swapping in Postgres later means reimplementing `readRaw`/`write` and
 * nothing else — every module talks to the database only through this file.
 */

/**
 * Where the JSON ledger lives. `LEMMA_DATA_DIR` overrides it; a read-only filesystem
 * (serverless deploys, for instance) falls back to the temp directory, which is the
 * only writable place there. Persistence then lasts the life of the instance instead
 * of the repo — acceptable for a demo, and `docs/DEMO-LIMITATIONS.md` says so.
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
/** If the demo is opened long after it was seeded, re-seed rather than time-warping. */
const MAX_REALIGNMENT_DAYS = 45;

let cache: Database | null = null;
let cacheForDate = '';

function readRaw(): Database | null {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw) as Database;
  } catch {
    return null;
  }
}

function write(db: Database) {
  const { __today, ...rest } = db;
  void __today;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rest, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/**
 * Keeps a stored dataset evergreen: every date moves forward by the number of days
 * since it was seeded, so "today's arrivals" still means something tomorrow, while
 * anything the demo operator changed by hand survives.
 */
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
  } else {
    db = createSeedDatabase(today);
  }

  db.__today = today;
  cache = db;
  cacheForDate = today;
  write(db);
  return db;
}

export function getDb(): Database {
  return load();
}

/** Read-modify-write in one synchronous step; the only sanctioned way to change data. */
export function mutate<T>(fn: (db: Database) => T): T {
  const db = getDb();
  const result = fn(db);
  db.updatedAt = new Date().toISOString();
  write(db);
  return result;
}

export function resetDemoData(): Database {
  const today = businessToday();
  const fresh = createSeedDatabase(today);
  cache = fresh;
  cacheForDate = today;
  write(fresh);
  return fresh;
}

export function dbStats() {
  const db = getDb();
  return {
    file: DB_FILE.replace(process.cwd() + path.sep, ''),
    exists: fs.existsSync(DB_FILE),
    sizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    seededOn: db.seededOn,
    today: db.__today,
    counts: {
      apartments: db.apartments.length,
      guests: db.guests.length,
      staff: db.staff.length,
      reservations: db.reservations.length,
      payments: db.payments.length,
      housekeeping: db.housekeeping.length,
      notifications: db.notifications.length,
    },
  };
}
