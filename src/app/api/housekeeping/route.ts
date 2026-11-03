import { apiRoute, readBody } from '@/lib/api/http';
import { housekeepingCreateSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { createHousekeepingTask } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const POST = apiRoute({
  permission: 'housekeeping.assign',
  handler: async ({ req, session }) => {
    const input = await readBody(req, housekeepingCreateSchema);
    return mutate((db) => ({ task: createHousekeepingTask(db, session.user.id, input), snapshot: buildSnapshot(db, session) }));
  },
});
