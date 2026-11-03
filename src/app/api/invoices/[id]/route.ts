import { apiRoute, HttpError } from '@/lib/api/http';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';

export const runtime = 'nodejs';

export const GET = apiRoute({
  permission: 'invoices.view',
  handler: async ({ params }) => {
    await ensureCloudFirestoreHydrated();
    const db = getDb();
    const invoice = (db.invoices ?? []).find((i) => i.id === params.id);
    if (!invoice) throw new HttpError('Invoice not found.', 404, 'not_found');
    return invoice;
  },
});
