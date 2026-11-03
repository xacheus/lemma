import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { getLocalMediaFilePath } from '@/lib/cloudinary/server';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
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
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
