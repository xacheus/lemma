import { apiRoute, HttpError } from '@/lib/api/http';
import { createSignedUploadTicket, isCloudinaryConfigured } from '@/lib/cloudinary/server';

export const runtime = 'nodejs';

export const POST = apiRoute({
  handler: async ({ req, session }) => {
    const body = (await req.json().catch(() => ({}))) as {
      category?: string;
      apartmentId?: string | null;
    };
    const category = body.category || 'apartment';
    if (!['apartment', 'brand', 'property_document', 'maintenance', 'payment_proof', 'profile_photo'].includes(category)) {
      throw new HttpError('Unknown media category.', 422, 'validation');
    }
    if (body.apartmentId && !/^[a-zA-Z0-9_-]+$/.test(body.apartmentId)) {
      throw new HttpError('Invalid apartment reference.', 422, 'validation');
    }
    if (process.env.VERCEL && !isCloudinaryConfigured()) {
      throw new HttpError('Photograph storage is not connected. Please try again later.', 503, 'media_unavailable');
    }

    // Validate upload permissions by category
    if (category === 'apartment' || category === 'property_document' || category === 'brand') {
      if (!session.permissions.has('media.manage') && !session.permissions.has('apartments.manage')) {
        throw new HttpError('Only authorised administrators can upload property or apartment media.', 403, 'forbidden');
      }
    } else if (category === 'maintenance') {
      if (!session.permissions.has('housekeeping.maintenance') && !session.permissions.has('media.manage')) {
        throw new HttpError('Not authorised to upload maintenance photographs.', 403, 'forbidden');
      }
    } else if (!session.permissions.has('media.manage') && !(category === 'payment_proof' && session.permissions.has('payments.record'))) {
      throw new HttpError('You cannot upload this type of file.', 403, 'forbidden');
    }

    return createSignedUploadTicket({
      category,
      apartmentId: body.apartmentId ?? null,
    });
  },
});
