import { apiRoute } from '@/lib/api/http';
import { dbStats, resetDemoData } from '@/lib/db/store';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'settings.manage',
  handler: () => dbStats(),
});

/**
 * Rebuilds the demo ledger from the generator. Everything hand-entered during the
 * session is discarded — the UI says so and asks for confirmation first.
 */
export const POST = apiRoute({
  permission: 'data.reset',
  handler: ({ session }) => {
    resetDemoData();
    return mutate((db) => ({ reset: true, snapshot: buildSnapshot(db, session) }));
  },
});
