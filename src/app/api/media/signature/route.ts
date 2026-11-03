import { apiRoute, HttpError } from '@/lib/api/http';
import { createSignedUploadTicket } from '@/lib/cloudinary/server';

export const runtime = 'nodejs';

export const POST = apiRoute({
  handler: async ({ req, session }) => {
    const body = (await req.json().catch(() => ({}))) as {
      category?: string;
      apartmentId?: string | null;
    };
    const category = body.category || 'apartment';

    // Validate upload permissions by category
    if (category === 'apartment' || category === 'property_document' || category === 'brand') {
      if (!session.permissions.has('media.manage') && !session.permissions.has('apartments.manage')) {
        throw new HttpError('Only authorised administrators can upload property or apartment media.', 403, 'forbidden');
      }
    } else if (category === 'maintenance') {
      if (!session.permissions.has('housekeeping.maintenance') && !session.permissions.has('media.manage')) {
        throw new HttpError('Not authorised to upload maintenance photographs.', 403, 'forbidden');
      }
    }

    return createSignedUploadTicket({
      category,
      apartmentId: body.apartmentId ?? null,
    });
  },
});
