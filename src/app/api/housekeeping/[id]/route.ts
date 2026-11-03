import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { housekeepingPatchSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { updateHousekeepingTask } from '@/lib/domain/operations';

export const runtime = 'nodejs';

/**
 * Status changes need `housekeeping.complete`; moving work between people or
 * re-scheduling needs `housekeeping.assign`. A cleaner posting to this endpoint is
 * additionally confined to their own jobs inside the operation itself.
 */
export const PATCH = apiRoute({
  permission: 'housekeeping.view',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, housekeepingPatchSchema);
    const touchingStatus = patch.status !== undefined;
    const touchingSchedule = patch.assignedTo !== undefined || patch.date !== undefined || patch.apartmentId !== undefined;
    if (touchingStatus && !session.permissions.has('housekeeping.complete') && !session.permissions.has('housekeeping.assign')) {
      throw new HttpError('Your role can view housekeeping but not change cleaning status.', 403, 'forbidden');
    }
    if (touchingSchedule && !session.permissions.has('housekeeping.assign')) {
      throw new HttpError('Only a supervisor can reassign or reschedule cleaning work.', 403, 'forbidden');
    }
    return mutate((db) => ({
      task: updateHousekeepingTask(db, session.user.id, params.id, patch),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
