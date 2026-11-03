import { apiRoute } from '@/lib/api/http';
import { buildSnapshot } from '@/lib/api/snapshot';
import { getDb } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the admin single-page shell needs, projected for the signed-in role. */
export const GET = apiRoute({
  handler: ({ session }) => buildSnapshot(getDb(), session),
});
