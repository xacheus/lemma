import { apiRoute, readBody } from '@/lib/api/http';
import { userRoleChangeSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { changeUserRole } from '@/lib/domain/operations';
import { buildSnapshot, stripUser } from '@/lib/api/snapshot';
import { syncFirebaseRoleClaims } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  roles: ['super_admin', 'admin'],
  permission: 'staff.manage',
  handler: async ({ req, session, params }) => {
    const input = await readBody(req, userRoleChangeSchema);
    const { updated, snapshot } = await runAtomicTransaction((db) => {
      const target = changeUserRole(db, session.uid, params.uid, input);
      return {
        updated: stripUser(target),
        snapshot: buildSnapshot(db, session),
      };
    });

    const claimsSync = await syncFirebaseRoleClaims(
      updated.uid,
      updated.role,
      updated.accountStatus,
    );

    return {
      user: updated,
      firebaseClaimsSynced: claimsSync.synced,
      snapshot,
    };
  },
});
