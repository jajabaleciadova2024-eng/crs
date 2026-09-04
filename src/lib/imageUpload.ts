/**
 * Getting a phone photo to the server in one piece.
 *
 * Two things go wrong between "attach" and "submit", and neither of them
 * produced a message anyone could act on:
 *
 * 1. **Size.** A modern phone camera writes 3–8MB per shot, while the
 *    hosting platform refuses any request body over ~4.5MB. Two photos are
 *    already over the line. The rejection happens *before* our route runs,
 *    so the response is not our JSON — the page fell through to a bare
 *    "Couldn't submit." with nothing to fix.
 * 2. **The connection.** `fetch` rejects outright when a mobile connection
 *    drops mid-upload. Nothing caught it, so the button spun forever.
 *
 * `shrinkImagesForUpload` re-encodes what was picked so a set of photos
 * fits inside one request; `readUploadError` and `NETWORK_ERROR_MESSAGE` turn
 * whatever comes back — our JSON, a platform 413, or a dead socket — into a
 * sentence that says what to do next.
 *
 * Everything here runs in the browser (canvas), so it is only ever called
 * from a client component. The pure helpers below are exported separately
 * so they can be tested without a DOM.
 */

/** What one request can carry. The platform's own cap is ~4.5MB; leave room for the other form fields. */
export const UPLOAD_BUDGET_BYTES = 4 * 1024 * 1024;
/** No single image needs to be bigger than this to read a certificate or a screenshot. */
const PER_FILE_CEILING = 1_200_000;
/** Below this, re-encoding costs quality and saves nothing worth having. */
const LEAVE_ALONE_BYTES = 300_000;
const FIRST_PASS_EDGE = 1800;
const SECOND_PASS_EDGE = 1280;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.5;

/** Formats can't survive a canvas round-trip: animation and vectors are lost. */
const UNTOUCHABLE = new Set(["image/gif", "image/svg+xml"]);

export function totalBytes(files: { size: number }[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * How big each image may be so that all of them together still fit. Six
 * photos get a smaller allowance each than one does — with a floor, because
 * an image squeezed below ~240KB stops being proof of anything.
 */
export function perFileTargetBytes(count: number): number {
  if (count <= 0) return PER_FILE_CEILING;
  return Math.max(240_000, Math.min(PER_FILE_CEILING, Math.floor(UPLOAD_BUDGET_BYTES / count)));
}

/**
 * Statuses the route never sends — they come from the platform in front of
 * it, with a body that isn't JSON, and used to read as a generic failure.
 */
export function statusMessage(status: number): string | null {
  if (status === 413) return "Those files are too large to send in one go. Attach fewer, or smaller, files.";
  if (status === 408 || status === 504) return "The upload timed out. Check your connection and try again.";
  if (status === 502 || status === 503) return "The server didn't answer. Please try again in a moment.";
  return null;
}

/** Our own error first, then the platform's, then whatever the caller wanted to say. */
export async function readUploadError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (body?.error) return body.error;
  return statusMessage(res.status) ?? fallback;
}

/** A rejected fetch means the request never left — say that, rather than blaming the file. */
export const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeImage(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Falls through to <img>, which handles a few formats createImageBitmap won't.
    }
  }
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function drawToBlob(decoded: Decoded, edge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // A transparent PNG flattened to JPEG goes black without this.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality));
}

function renameToJpeg(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "") || "photo";
  return `${stem}.jpg`;
}

/**
 * Re-encode one image down to roughly `targetBytes`, dropping quality and
 * then resolution until it fits. Returns the original untouched whenever
 * shrinking isn't possible or isn't worth it — a caller can always send
 * what the member actually picked.
 */
export async function shrinkImage(file: File, targetBytes: number): Promise<File> {
  if (!file.type.startsWith("image/") || UNTOUCHABLE.has(file.type)) return file;
  if (file.size <= Math.max(targetBytes, LEAVE_ALONE_BYTES)) return file;
  if (typeof document === "undefined") return file;

  const decoded = await decodeImage(file);
  if (!decoded) return file;

  try {
    let best: Blob | null = null;
    for (const edge of [FIRST_PASS_EDGE, SECOND_PASS_EDGE]) {
      for (let quality = START_QUALITY; quality >= MIN_QUALITY; quality -= 0.16) {
        const blob = await drawToBlob(decoded, edge, quality);
        if (!blob) return file;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= targetBytes) {
          return new File([blob], renameToJpeg(file.name), { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
    }
    // Never send something bigger than what was picked.
    if (!best || best.size >= file.size) return file;
    return new File([best], renameToJpeg(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    decoded.release();
  }
}

/**
 * Prepare a whole picked set for one request: shrink each image, then, if
 * they still don't fit together, squeeze harder before giving up. The error
 * — when there is one — names the sizes, because "too large" without a
 * number tells nobody how much to drop.
 *
 * Images are handled one at a time on purpose: decoding six phone photos at
 * once is what makes a mid-range phone kill the tab.
 */
export async function shrinkImagesForUpload(
  files: File[],
  budgetBytes: number = UPLOAD_BUDGET_BYTES,
): Promise<{ files: File[]; error: string | null }> {
  if (files.length === 0) return { files, error: null };

  const target = perFileTargetBytes(files.length);
  const first: File[] = [];
  for (const file of files) first.push(await shrinkImage(file, target));
  if (totalBytes(first) <= budgetBytes) return { files: first, error: null };

  // Still over: give every image an equal, stricter share of what's left.
  const stricter = Math.floor((budgetBytes / files.length) * 0.8);
  const second: File[] = [];
  for (const file of first) second.push(await shrinkImage(file, stricter));
  if (totalBytes(second) <= budgetBytes) return { files: second, error: null };

  return {
    files: second,
    error: `These add up to ${formatBytes(totalBytes(second))}, over the ${formatBytes(budgetBytes)} one upload can carry. Send fewer at a time.`,
  };
}

/** The single-file case, kept separate so callers don't have to build an array. */
export async function shrinkOneForUpload(
  file: File,
  budgetBytes: number = UPLOAD_BUDGET_BYTES,
): Promise<{ file: File; error: string | null }> {
  const { files, error } = await shrinkImagesForUpload([file], budgetBytes);
  return { file: files[0] ?? file, error };
}
