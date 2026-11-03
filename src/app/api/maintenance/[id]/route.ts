import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { maintenancePatchSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { updateMaintenanceTicket } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'housekeeping.maintenance',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, maintenancePatchSchema);
    if (session.user.role === 'cleaner' && patch.assignedTo !== undefined) {
      throw new HttpError('Only supervisors or administrators can reassign maintenance tickets.', 403, 'forbidden');
    }
    return runAtomicTransaction((db) => {
      const ticket = updateMaintenanceTicket(db, session.uid, params.id, patch);
      return { ticket, snapshot: buildSnapshot(db, session) };
    });
  },
});
