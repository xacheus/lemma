import { getSession, type Session } from '../auth/session';
import { ensureCloudFirestoreHydrated, getDb, StoreUnavailableError } from '../db/store';
import type { Database } from '../domain/types';

let lastOutageLog = 0;

/** Public GET pages may show contact details during an outage, but never stale inventory. */
export async function readPublicSiteData(): Promise<{ db: Database; session: Session | null } | null> {
  try {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const session = await getSession();
    return { db, session };
  } catch (error) {
    if (!(error instanceof StoreUnavailableError)) throw error;
    if (Date.now() - lastOutageLog > 60_000) {
      console.error('[public] Booking records unavailable:', error.message);
      lastOutageLog = Date.now();
    }
    return null;
  }
}
