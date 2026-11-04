/**
 * Client-side payment-proof file preparation.
 *
 * Mobile camera photos and high-DPI screenshots are routinely 3–12 MB. Instead
 * of rejecting them with a raw byte limit, we downscale and compress images in
 * the browser before attaching them so guests can pick any photo directly from
 * their gallery.
 */

export interface PreparedProofFile {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

const TARGET_MAX_BYTES = 450 * 1024;
const DIRECT_PASS_BYTES = 380 * 1024;
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

function estimateBase64Bytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image'));
    };
    img.src = objectUrl;
  });
}

export async function preparePaymentProofFile(
  file: File,
): Promise<{ ok: true; file: PreparedProofFile } | { ok: false; error: string }> {
  const mimeType = file.type.toLowerCase();
  if (!ACCEPTED_TYPES.has(mimeType)) {
    return {
      ok: false,
      error: 'Please choose an image (JPEG, PNG, or WebP) or a PDF slip.',
    };
  }

  if (mimeType === 'application/pdf') {
    if (file.size > TARGET_MAX_BYTES) {
      return {
        ok: false,
        error:
          'That PDF slip is quite large. Please attach a screenshot of the receipt instead, or submit your transaction reference directly.',
      };
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      if (!dataUrl) throw new Error('empty');
      return {
        ok: true,
        file: {
          fileName: file.name,
          mimeType: 'application/pdf',
          dataUrl,
          sizeBytes: file.size,
        },
      };
    } catch {
      return {
        ok: false,
        error: 'Could not read that PDF. Please enter your transaction reference above.',
      };
    }
  }

  if (file.size <= DIRECT_PASS_BYTES) {
    try {
      const dataUrl = await readAsDataUrl(file);
      if (dataUrl) {
        return {
          ok: true,
          file: {
            fileName: file.name,
            mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
            dataUrl,
            sizeBytes: file.size,
          },
        };
      }
    } catch {
      // Fall through to canvas path.
    }
  }

  try {
    const img = await loadImage(file);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      throw new Error('Invalid image dimensions');
    }

    const attempts: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 1500, quality: 0.82 },
      { maxDim: 1280, quality: 0.72 },
      { maxDim: 1080, quality: 0.62 },
      { maxDim: 900, quality: 0.52 },
      { maxDim: 760, quality: 0.44 },
    ];

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'payment-proof';

    for (const { maxDim, quality } of attempts) {
      const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const sizeBytes = estimateBase64Bytes(dataUrl);
      if (sizeBytes <= TARGET_MAX_BYTES) {
        return {
          ok: true,
          file: {
            fileName: `${baseName}.jpg`,
            mimeType: 'image/jpeg',
            dataUrl,
            sizeBytes,
          },
        };
      }
    }

    return {
      ok: false,
      error:
        'Could not prepare that image cleanly. Please crop the screenshot or submit your transaction reference without an attachment.',
    };
  } catch {
    return {
      ok: false,
      error: 'Could not read that image. Please try another photo or submit your transaction reference.',
    };
  }
}
