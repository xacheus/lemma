import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { staffImportSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { importStaff, parseStaffCsv, staffImportCsv } from '@/lib/domain/staff-import';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

/**
 * Bulk staff creation from a CSV.
 *
 * Each row becomes its own account with its own generated password (hashed before
 * it is stored). The plaintext is returned once, for the person who imported the
 * list to hand over — the product has no mail provider, so it is never emailed and
 * never retrievable again.
 *
 * Privilege rules mirror the single-account route: only a super administrator can
 * create another super administrator, and this importer does not offer that role at
 * all. Existing usernames are reported, never silently overwritten.
 */
export const POST = apiRoute({
  permission: 'staff.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, staffImportSchema);
    const parsed = parseStaffCsv(input.csv);
    if (parsed.error) throw new HttpError(parsed.error, 422, 'validation');

    return runAtomicTransaction((db) => {
      const result = importStaff(db, session.user.id, parsed.rows);
      return {
        ...result,
        passwordSheet: result.created.length ? staffImportCsv(result) : '',
        snapshot: buildSnapshot(db, session),
      };
    });
  },
});
