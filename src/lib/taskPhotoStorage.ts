import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Proof photos attached to a task completion. Private bucket, same posture
// as leave-documents (see documentStorage.ts): no storage.objects policies
// exist, so there is no direct client access at all — every read is
// mediated by an API route that authorizes the caller first, then mints a
// short-lived signed URL.

const BUCKET = "task-photos";
const SIGNED_URL_TTL_SECONDS = 60;

export async function uploadTaskPhoto(path: string, mimeType: string, buffer: Buffer) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[taskPhotoStorage] upload failed:", error);
    return { ok: false as const, error: "Couldn't upload the photo. Please try again." };
  }
  return { ok: true as const, path };
}

export async function getTaskPhotoUrl(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * A pair of links: one to show the image inline, one that saves it.
 *
 * Two signed URLs rather than one, because the difference is the
 * Content-Disposition Supabase attaches — the same URL cannot both render in
 * an <img> and download. Same shape as getLeaveDocumentLinks, which is the
 * behaviour this mirrors.
 */
export async function getTaskPhotoLinks(path: string, downloadFileName: string) {
  const admin = createAdminClient();
  const [view, download] = await Promise.all([
    admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
    admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: downloadFileName }),
  ]);
  if (view.error || !view.data || download.error || !download.data) return null;
  return { viewUrl: view.data.signedUrl, downloadUrl: download.data.signedUrl };
}

export async function deleteTaskPhoto(path: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) console.error("[taskPhotoStorage] delete failed:", error);
}
