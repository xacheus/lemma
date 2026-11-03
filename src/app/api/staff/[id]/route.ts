import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { staffSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { setStaffPermissions, upsertStaff } from '@/lib/domain/operations';
import { ALL_PERMISSIONS } from '@/lib/domain/permissions';
import type { PermissionKey } from '@/lib/domain/types';
import type { StaffUser } from '@/lib/domain/types';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'staff.manage',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, staffSchema.partial());
    return mutate((db) => {
      const target = db.staff.find((s) => s.id === params.id);
      if (!target) throw new HttpError('Staff account not found.', 404, 'not_found');

      const deactivating = patch.active === false && target.active;
      if (deactivating && target.id === session.user.id) {
        throw new HttpError('You cannot deactivate the account you are signed in with.', 409, 'self_deactivation');
      }
      const losingAdmin =
        target.role === 'admin' && (deactivating || (patch.role && patch.role !== 'admin'));
      if (losingAdmin) {
        const otherAdmins = db.staff.filter((s) => s.id !== target.id && s.role === 'admin' && s.active);
        if (!otherAdmins.length) {
          throw new HttpError(
            'This is the only active administrator. Promote someone else before removing their access.',
            409,
            'last_admin',
          );
        }
      }

      const { permissions, ...rest } = patch;
      const staff = upsertStaff(db, session.user.id, { ...rest, id: target.id });
      if (permissions !== undefined) {
        const unknown = (permissions ?? []).filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
        if (unknown.length) throw new HttpError(`Unknown permission keys: ${unknown.join(', ')}`, 422, 'validation');
        setStaffPermissions(db, target.id, permissions ? (permissions as PermissionKey[]) : null);
      }
      return { staff: staff as StaffUser, snapshot: buildSnapshot(db, session) };
    });
  },
});
