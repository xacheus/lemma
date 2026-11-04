import type { Database } from '../domain/types';

/** Firestore is the source of truth for all these collections. Never truncate a
 * collection on read: hiding older bookings also hides occupied nights. */
export const CLOUD_COLLECTIONS = [
  { collection: 'users', field: 'users', key: 'uid' },
  { collection: 'apartments', field: 'apartments', key: 'id' },
  { collection: 'guests', field: 'guests', key: 'id' },
  { collection: 'bookings', field: 'reservations', key: 'id' },
  { collection: 'payments', field: 'payments', key: 'id' },
  { collection: 'quotations', field: 'quotations', key: 'id' },
  { collection: 'invoices', field: 'invoices', key: 'id' },
  { collection: 'receipts', field: 'receipts', key: 'id' },
  { collection: 'staff_tasks', field: 'housekeeping', key: 'id' },
  { collection: 'maintenance', field: 'maintenance', key: 'id' },
  { collection: 'media', field: 'media', key: 'id' },
  { collection: 'notifications', field: 'notifications', key: 'id' },
  { collection: 'payment_claims', field: 'paymentClaims', key: 'id' },
  { collection: 'booking_access', field: 'bookingAccess', key: 'id' },
  { collection: 'audit_logs', field: 'auditLogs', key: 'id' },
] as const;

export type CloudDocuments = Map<string, Record<string, unknown>>;

/** Convert to Firestore-compatible plain objects (strip undefined values). */
export function cloudDocuments(db: Database): CloudDocuments {
  const result: CloudDocuments = new Map();
  for (const { collection, field, key } of CLOUD_COLLECTIONS) {
    const records = (db[field] ?? []) as unknown as Array<Record<string, unknown>>;
    for (const record of records) {
      const id = record[key];
      if (typeof id === 'string' && id) {
        result.set(`${collection}/${id}`, JSON.parse(JSON.stringify(record)) as Record<string, unknown>);
      }
    }
  }
  result.set('settings/business', JSON.parse(JSON.stringify(db.settings)) as Record<string, unknown>);
  if (db.settings.googleBusiness) {
    result.set('settings/google_business', JSON.parse(JSON.stringify(db.settings.googleBusiness)) as Record<string, unknown>);
  }
  return result;
}

/** A deletion is a write too: otherwise removing an apartment only hides it until
 * the next instance starts and reloads the old document. */
export function cloudDocumentChanges(before: CloudDocuments, after: CloudDocuments): Array<{
  path: string;
  data: Record<string, unknown> | null;
}> {
  const changes: Array<{ path: string; data: Record<string, unknown> | null }> = [];
  for (const [path, data] of after) {
    if (JSON.stringify(data) !== JSON.stringify(before.get(path))) changes.push({ path, data });
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changes.push({ path, data: null });
  }
  return changes;
}
