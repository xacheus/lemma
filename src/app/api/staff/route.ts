import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { staffSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { upsertStaff } from '@/lib/domain/operations';
import type { PermissionKey } from '@/lib/domain/types';

export const runtime = 'nodejs';

export const POST = apiRoute({
  permission: 'staff.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, staffSchema);
    if (input.role === 'super_admin' && session.user.role !== 'super_admin') {
      throw new HttpError(
        'Only an active Super Administrator can create another Super Administrator.',
        403,
        'super_admin_required',
      );
    }
    return runAtomicTransaction((db) => ({
      staff: upsertStaff(db, session.user.id, {
        ...input,
        permissions: input.permissions ? (input.permissions as PermissionKey[]) : input.permissions,
      }),
      snapshot: buildSnapshot(db, session),
    }));
  },
});
