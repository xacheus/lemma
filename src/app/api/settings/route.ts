import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { settingsSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import { patchSettings } from '@/lib/domain/operations';

export const runtime = 'nodejs';

export const PATCH = apiRoute({
  permission: 'settings.manage',
  handler: async ({ req, session }) => {
    const patch = await readBody(req, settingsSchema);
    return mutate((db) => {
      const booking = (patch as { booking?: Record<string, unknown> }).booking;
      if (booking) {
        const deposit = Number(booking.depositPercent);
        if (Number.isFinite(deposit) && (deposit < 0 || deposit > 100)) {
          throw new HttpError('The deposit percentage must be between 0 and 100.', 422, 'validation');
        }
        const policy = Number(booking.cancellationPolicyHours);
        if (Number.isFinite(policy) && policy < 0) {
          throw new HttpError('The cancellation window cannot be negative.', 422, 'validation');
        }
      }
      patchSettings(db, patch as Record<string, unknown>);
      return { settings: db.settings, snapshot: buildSnapshot(db, session) };
    });
  },
});
