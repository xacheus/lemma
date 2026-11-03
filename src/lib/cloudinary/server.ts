import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudinaryUrlFromPublicId } from './urls';

/**
 * Trusted Server-Only Cloudinary Integration
 *
 * Cloud name:   hpxm6znp
 * Upload preset: lemma_uploads (Signed)
 *
 * SECURITY INVARIANT:
 * `CLOUDINARY_API_SECRET` is read ONLY on the server and NEVER exposed to browser
 * bundles or `NEXT_PUBLIC_*` environment variables.
 */

export const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
  'hpxm6znp';

export const CLOUDINARY_UPLOAD_PRESET =
  process.env.CLOUDINARY_UPLOAD_PRESET || 'lemma_uploads';

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;    // 10 MB
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export function isCloudinaryConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CLOUDINARY_API_SECRET) {
    throw new Error(
      'SECURITY VIOLATION: CLOUDINARY_API_SECRET must never be prefixed with NEXT_PUBLIC_.',
    );
  }
  return Boolean(
    CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Generates an authentic Cloudinary SHA-1 parameter signature for signed uploads
 * (`lemma_uploads`) and signed `destroy` requests.
 *
 * Cloudinary specification:
 *   1. Exclude `file`, `cloud_name`, `resource_type`, and `api_key`.
 *   2. Sort remaining non-empty parameters alphabetically by key.
 *   3. Join as `key1=value1&key2=value2` and append `api_secret` directly.
 *   4. Return hex SHA-1 digest.
 */
export function signCloudinaryParams(
  params: Record<string, string | number | boolean | undefined | null>,
  apiSecret?: string,
): string {
  const secret = apiSecret ?? process.env.CLOUDINARY_API_SECRET;
  if (!secret) {
    throw new Error('CLOUDINARY_API_SECRET is not configured on the server.');
  }
  const serialized = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  return createHash('sha1').update(`${serialized}${secret}`).digest('hex');
}

export interface SignedUploadPayload {
  configured: boolean;
  cloudName: string;
  uploadPreset: string;
  apiKey: string | null;
  timestamp: number;
  signature: string | null;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

export function createSignedUploadTicket(opts: {
  category: string;
  apartmentId?: string | null;
}): SignedUploadPayload {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = opts.apartmentId
    ? `lemma_apartments/${opts.category}/${opts.apartmentId}`
    : `lemma_apartments/${opts.category}`;
  const publicId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  if (!isCloudinaryConfigured()) {
    return {
      configured: false,
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      apiKey: null,
      timestamp,
      signature: null,
      folder,
      publicId,
      uploadUrl: '/api/media',
    };
  }

  const signature = signCloudinaryParams({
    folder,
    public_id: publicId,
    timestamp,
    upload_preset: CLOUDINARY_UPLOAD_PRESET,
  });

  return {
    configured: true,
    cloudName: CLOUDINARY_CLOUD_NAME,
    uploadPreset: CLOUDINARY_UPLOAD_PRESET,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
  };
}

function resolveLocalMediaDir(): string {
  const base = process.env.LEMMA_DATA_DIR || path.join(process.cwd(), '.data');
  const dir = path.join(base, 'media');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch {
    const fallback = path.join(os.tmpdir(), 'lemma-data', 'media');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export function getLocalMediaFilePath(fileName: string): string {
  const safe = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(resolveLocalMediaDir(), safe);
}

export interface StoredMediaAsset {
  url: string;
  thumbnailUrl: string;
  detailUrl: string;
  publicId: string;
  storageProvider: 'cloudinary' | 'local';
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Uploads binary buffer to Cloudinary using signed `lemma_uploads` preset when
 * `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are present on the server;
 * falls back cleanly to local workspace media storage when cloud credentials
 * have not yet been supplied in `.env.local`.
 */
export async function uploadMediaAsset(input: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  category: string;
  apartmentId?: string | null;
}): Promise<StoredMediaAsset> {
  const isPdf = input.mimeType === 'application/pdf';
  const maxBytes = isPdf ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  if (input.buffer.byteLength > maxBytes) {
    throw new Error(
      `File exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))}MB.`,
    );
  }
  if (!ALLOWED_DOCUMENT_MIMES.has(input.mimeType)) {
    throw new Error(`Unsupported file type "${input.mimeType}". Allowed: JPG, PNG, WEBP, PDF.`);
  }

  const folder = input.apartmentId
    ? `lemma_apartments/${input.category}/${input.apartmentId}`
    : `lemma_apartments/${input.category}`;
  const shortId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  if (isCloudinaryConfigured()) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      folder,
      public_id: shortId,
      timestamp,
      upload_preset: CLOUDINARY_UPLOAD_PRESET,
    };
    const signature = signCloudinaryParams(paramsToSign);
    const resourceType = isPdf ? 'raw' : 'image';
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const form = new FormData();
    const base64DataUri = `data:${input.mimeType};base64,${input.buffer.toString('base64')}`;
    form.append('file', base64DataUri);
    form.append('api_key', process.env.CLOUDINARY_API_KEY!);
    form.append('timestamp', String(timestamp));
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', folder);
    form.append('public_id', shortId);
    form.append('signature', signature);

    const res = await fetch(endpoint, { method: 'POST', body: form });
    const json = (await res.json()) as {
      secure_url?: string;
      public_id?: string;
      bytes?: number;
      width?: number;
      height?: number;
      error?: { message?: string };
    };
    if (!res.ok || !json.secure_url || !json.public_id) {
      throw new Error(json.error?.message || `Cloudinary upload failed (${res.status}).`);
    }

    return {
      url: json.secure_url,
      thumbnailUrl: isPdf
        ? json.secure_url
        : cloudinaryUrlFromPublicId(json.public_id, 'thumbnail', CLOUDINARY_CLOUD_NAME),
      detailUrl: isPdf
        ? json.secure_url
        : cloudinaryUrlFromPublicId(json.public_id, 'detail', CLOUDINARY_CLOUD_NAME),
      publicId: json.public_id,
      storageProvider: 'cloudinary',
      sizeBytes: json.bytes ?? input.buffer.byteLength,
      width: json.width ?? null,
      height: json.height ?? null,
    };
  }

  // Local workspace storage when CLOUDINARY_API_SECRET is not set in local dev
  const ext =
    input.mimeType === 'application/pdf'
      ? '.pdf'
      : input.mimeType === 'image/png'
        ? '.png'
        : input.mimeType === 'image/webp'
          ? '.webp'
          : '.jpg';
  const fileName = `${shortId}${ext}`;
  const fullPath = getLocalMediaFilePath(fileName);
  fs.writeFileSync(fullPath, input.buffer);

  const localUrl = `/api/media/file/${fileName}`;
  return {
    url: localUrl,
    thumbnailUrl: localUrl,
    detailUrl: localUrl,
    publicId: `${folder}/${shortId}`,
    storageProvider: 'local',
    sizeBytes: input.buffer.byteLength,
    width: null,
    height: null,
  };
}

/**
 * Securely deletes an asset from Cloudinary (or local fallback disk) on backend.
 */
export async function deleteMediaAssetFromStorage(opts: {
  publicId: string;
  url: string;
  mediaType: 'image' | 'document';
  storageProvider: 'cloudinary' | 'local';
}): Promise<{ deletedFromRemote: boolean; detail: string }> {
  if (opts.storageProvider === 'cloudinary' && isCloudinaryConfigured()) {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      invalidate: 'true',
      public_id: opts.publicId,
      timestamp,
    };
    const signature = signCloudinaryParams(params);
    const resourceType = opts.mediaType === 'document' ? 'raw' : 'image';
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`;

    const body = new URLSearchParams({
      public_id: opts.publicId,
      timestamp: String(timestamp),
      invalidate: 'true',
      api_key: process.env.CLOUDINARY_API_KEY!,
      signature,
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(payload.error?.message || `Cloudinary destroy failed (${res.status}).`);
    }
    return {
      deletedFromRemote: payload.result === 'ok' || payload.result === 'not found',
      detail: `Cloudinary destroy result: ${payload.result ?? 'ok'}`,
    };
  }

  if (opts.url.startsWith('/api/media/file/')) {
    const fileName = opts.url.replace('/api/media/file/', '');
    const target = getLocalMediaFilePath(fileName);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return { deletedFromRemote: true, detail: 'Removed local uploaded media file.' };
    }
  }

  return { deletedFromRemote: false, detail: 'Static reference detached from database.' };
}
