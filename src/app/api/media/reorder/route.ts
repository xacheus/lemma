import { apiRoute, readBody } from '@/lib/api/http';
import { galleryReorderSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { reorderApartmentGallery } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const POST = apiRoute({
  permission: 'media.manage',
  handler: async ({ req, session }) => {
    const input = await readBody(req, galleryReorderSchema);
    return runAtomicTransaction((db) => {
      const apartment = reorderApartmentGallery(
        db,
        session.uid,
        input.apartmentId,
        input.orderedIds,
      );
      return { apartment, snapshot: buildSnapshot(db, session) };
    });
  },
});
