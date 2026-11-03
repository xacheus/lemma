import { apiRoute } from '@/lib/api/http';
import { dbStats } from '@/lib/db/store';

export const runtime = 'nodejs';

/**
 * Read-only storage figures for the settings screen: counts, backend mode and
 * where the live database file lives. There is deliberately no write verb here —
 * records are never regenerated, and nothing on this route can destroy data.
 */
export const GET = apiRoute({
  permission: 'settings.manage',
  handler: () => dbStats(),
});
