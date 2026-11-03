import { apiRoute, readBody } from '@/lib/api/http';
import { mediaPatchSchema } from '@/lib/api/schemas';
import { runAtomicTransaction } from '@/lib/db/store';
import { detachAndRemoveMediaRecord, updateMediaRecord } from '@/lib/domain/operations';
import { deleteMediaAssetFromStorage } from '@/lib/cloudinary/server';
import { buildSnapshot } from '@/lib/api/snapshot';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'media.manage',
  handler: async ({ req, session, params }) => {
    const patch = await readBody(req, mediaPatchSchema);
    return runAtomicTransaction((db) => {
      const media = updateMediaRecord(db, session.uid, params.id, patch);
      return { media, snapshot: buildSnapshot(db, session) };
    });
  },
});

export const DELETE = apiRoute({
  permission: 'media.manage',
  handler: async ({ session, params }) => {
    const { removed, snapshot } = await runAtomicTransaction((db) => {
      const target = detachAndRemoveMediaRecord(db, session.uid, params.id);
      return { removed: target, snapshot: buildSnapshot(db, session) };
    });

    // Also delete the asset from Cloudinary (`hpxm6znp`) or local media disk
    const remoteResult = await deleteMediaAssetFromStorage({
      publicId: removed.publicId,
      url: removed.url,
      mediaType: removed.mediaType,
      storageProvider: removed.storageProvider,
    });

    return {
      deletedId: removed.id,
      remoteDeleted: remoteResult.deletedFromRemote,
      detail: remoteResult.detail,
      snapshot,
    };
  },
});
