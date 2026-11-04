import { apiRoute, HttpError } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb, runAtomicTransaction } from '@/lib/db/store';
import { paginateRecords } from '@/lib/db/pagination';
import { CLOUDINARY_CLOUD_NAME, isCloudinaryConfigured, uploadMediaAsset } from '@/lib/cloudinary/server';
import { registerMediaRecord } from '@/lib/domain/operations';
import { buildSnapshot } from '@/lib/api/snapshot';
import type { Session } from '@/lib/auth/session';
import type { MediaCategory } from '@/lib/domain/types';

export const runtime = 'nodejs';

const VALID_CATEGORIES = new Set<MediaCategory>([
  'apartment',
  'payment_proof',
  'profile_photo',
  'maintenance',
  'property_document',
  'brand',
]);

function checkUploadPermission(category: MediaCategory, session: Session) {
  const allowed =
    category === 'maintenance'
      ? session.permissions.has('housekeeping.maintenance') || session.permissions.has('media.manage')
      : category === 'payment_proof'
        ? session.permissions.has('payments.record') || session.permissions.has('media.manage')
        : session.permissions.has('media.manage') ||
          ((category === 'apartment' || category === 'brand') && session.permissions.has('apartments.manage'));
  if (!allowed) throw new HttpError('You cannot upload this type of file.', 403, 'forbidden');
}

export const GET = apiRoute({
  permission: 'media.view',
  handler: async ({ search }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const category = search.get('category') ?? 'all';
    const apartmentId = search.get('apartmentId') ?? 'all';
    const q = (search.get('q') ?? '').trim().toLowerCase();

    let rows = [...(db.media ?? [])];
    if (category !== 'all') rows = rows.filter((m) => m.category === category);
    if (apartmentId !== 'all') rows = rows.filter((m) => m.apartmentId === apartmentId);
    if (q) {
      rows = rows.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          (m.apartmentName && m.apartmentName.toLowerCase().includes(q)),
      );
    }

    return paginateRecords(rows, {
      cursor: search.get('cursor'),
      limit: search.get('limit') ? Number(search.get('limit')) : 20,
      getId: (m) => m.id,
    });
  },
});

export const POST = apiRoute({
  handler: async ({ req, session }) => {
    const contentType = req.headers.get('content-type') || '';

    // Supports both multipart file upload (single or multiple) AND signed-upload registration JSON
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const rawCategory = String(form.get('category') || 'apartment') as MediaCategory;
      if (!VALID_CATEGORIES.has(rawCategory)) throw new HttpError('Unknown media category.', 422, 'validation');
      const category = rawCategory;
      const apartmentId = (form.get('apartmentId') as string | null) || null;
      const titlePrefix = String(form.get('title') || '').trim();
      const description = String(form.get('description') || '').trim();
      const isCover = String(form.get('isCover') || '') === 'true';
      const replaceMediaId = (form.get('replaceMediaId') as string | null) || null;

      checkUploadPermission(category, session);
      if (process.env.VERCEL && !isCloudinaryConfigured()) {
        throw new HttpError('Photograph storage is not connected. Please try again later.', 503, 'media_unavailable');
      }
      if (apartmentId && !getDb().apartments.some((apt) => apt.id === apartmentId)) {
        throw new HttpError('Choose an apartment from the list before uploading.', 422, 'validation');
      }

      const files = form.getAll('files').filter((f): f is File => f instanceof File);
      const singleFile = form.get('file');
      if (singleFile instanceof File) files.push(singleFile);

      if (files.length > 24) throw new HttpError('Choose up to 24 files at a time.', 422, 'validation');
      if (!files.length) {
        throw new HttpError('Choose at least one image or PDF file to upload.', 422, 'validation');
      }

      const uploadedAssets: Awaited<ReturnType<typeof uploadMediaAsset>>[] = [];
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const stored = await uploadMediaAsset({
          buffer,
          mimeType: file.type || 'image/jpeg',
          originalName: file.name,
          category,
          apartmentId,
        });
        uploadedAssets.push(stored);
      }

      return runAtomicTransaction((db) => {
        const created = uploadedAssets.map((stored, idx) => {
          const origFile = files[idx];
          const mediaType = origFile.type === 'application/pdf' ? 'document' : 'image';
          const computedTitle =
            files.length > 1 && titlePrefix
              ? `${titlePrefix} (${idx + 1})`
              : titlePrefix || origFile.name.replace(/\.[^.]+$/, '');
          return registerMediaRecord(db, session.uid, {
            url: stored.url,
            thumbnailUrl: stored.thumbnailUrl,
            detailUrl: stored.detailUrl,
            publicId: stored.publicId,
            storageProvider: stored.storageProvider,
            mediaType,
            category,
            title: computedTitle,
            description,
            apartmentId,
            isCover: idx === 0 ? isCover : false,
            mimeType: origFile.type || 'image/jpeg',
            sizeBytes: stored.sizeBytes,
            width: stored.width,
            height: stored.height,
            replaceMediaId: idx === 0 ? replaceMediaId : null,
          });
        });

        return {
          created,
          snapshot: buildSnapshot(db, session),
        };
      });
    }

    // JSON callback after direct signed upload to Cloudinary `hpxm6znp`
    const body = ((await req.json()) ?? {}) as {
      url: string;
      thumbnailUrl?: string;
      detailUrl?: string;
      publicId: string;
      category?: MediaCategory;
      title?: string;
      description?: string;
      apartmentId?: string | null;
      isCover?: boolean;
      mimeType?: string;
      sizeBytes?: number;
      width?: number | null;
      height?: number | null;
      replaceMediaId?: string | null;
    };

    const category = body.category || 'apartment';
    if (!VALID_CATEGORIES.has(category)) throw new HttpError('Unknown media category.', 422, 'validation');
    checkUploadPermission(category, session);
    if (body.apartmentId && !getDb().apartments.some((apt) => apt.id === body.apartmentId)) {
      throw new HttpError('Choose an apartment from the list before uploading.', 422, 'validation');
    }
    if (!body.url || !body.publicId) {
      throw new HttpError('url and publicId are required.', 422, 'validation');
    }
    const folder = `lemma_apartments/${category}${body.apartmentId ? `/${body.apartmentId}` : ''}/`;
    const expectedOrigin = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;
    if (!body.url.startsWith(expectedOrigin) || !body.url.includes('/upload/') ||
        !body.publicId.startsWith(folder)) {
      throw new HttpError('The uploaded file does not match this property and category.', 422, 'validation');
    }

    return runAtomicTransaction((db) => {
      const record = registerMediaRecord(db, session.uid, {
        url: body.url,
        thumbnailUrl: body.thumbnailUrl || body.url,
        detailUrl: body.detailUrl || body.url,
        publicId: body.publicId,
        storageProvider: 'cloudinary',
        mediaType: body.mimeType === 'application/pdf' ? 'document' : 'image',
        category,
        title: body.title || 'Uploaded Asset',
        description: body.description || '',
        apartmentId: body.apartmentId ?? null,
        isCover: body.isCover,
        mimeType: body.mimeType || 'image/jpeg',
        sizeBytes: body.sizeBytes || 0,
        width: body.width ?? null,
        height: body.height ?? null,
        replaceMediaId: body.replaceMediaId ?? null,
      });
      return { created: [record], snapshot: buildSnapshot(db, session) };
    });
  },
});
