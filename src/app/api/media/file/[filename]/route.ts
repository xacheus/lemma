import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ensureCloudFirestoreHydrated, getDb } from '@/lib/db/store';
import { getLocalMediaFilePath } from '@/lib/cloudinary/server';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  await ensureCloudFirestoreHydrated();
  const record = (getDb().media ?? []).find(
    (item) => item.storageProvider === 'local' && item.url === `/api/media/file/${filename}`,
  );
  if (!record) {
    return NextResponse.json({ ok: false, error: 'Media file not found.' }, { status: 404 });
  }
  if (record.visibility !== 'public') {
    const session = await getSession();
    if (!session?.permissions.has('media.view') && !session?.permissions.has('payments.view')) {
      return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
    }
  }
  const fullPath = getLocalMediaFilePath(filename);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ ok: false, error: 'Media file not found.' }, { status: 404 });
  }
  const bytes = fs.readFileSync(fullPath);
  const ext = filename.toLowerCase();
  const contentType = ext.endsWith('.pdf')
    ? 'application/pdf'
    : ext.endsWith('.png')
      ? 'image/png'
      : ext.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': record.visibility === 'public' ? 'public, max-age=86400' : 'private, no-store',
    },
  });
}
