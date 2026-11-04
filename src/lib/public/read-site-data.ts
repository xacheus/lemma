import { getSession, type Session } from '../auth/session';
import { ensureCloudFirestoreHydrated, getDb, getFallbackDb } from '../db/store';
import type { Database } from '../domain/types';

let lastWarningLog = 0;

/**
 * Loads the active property database and current visitor session for public GET pages.
 * Falls back cleanly to the local catalogue if cloud hydration or session inspection fails,
 * ensuring the public website remains available.
 */
export async function readPublicSiteData(): Promise<{ db: Database; session: Session | null }> {
  try {
    await ensureCloudFirestoreHydrated();
  } catch (error) {
    if (Date.now() - lastWarningLog > 60_000) {
      console.warn('[public] Cloud hydration warning, using fallback store:', error);
      lastWarningLog = Date.now();
    }
  }

  let db: Database;
  try {
    db = getDb();
  } catch (error) {
    if (Date.now() - lastWarningLog > 60_000) {
      console.warn('[public] Store read fallback:', error);
      lastWarningLog = Date.now();
    }
    db = getFallbackDb();
  }

  let session: Session | null = null;
  try {
    session = await getSession();
  } catch (error) {
    if (Date.now() - lastWarningLog > 60_000) {
      console.warn('[public] Session check skipped:', error);
      lastWarningLog = Date.now();
    }
  }

  return { db, session };
}
