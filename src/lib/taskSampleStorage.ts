import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Sample photos attached to a task by the Team Leader — examples of what a
// member's proof should look like. Private bucket, same posture as
// task-photos and announcement-images: no storage.objects policies exist,
// so there is no direct client access at all. Every read is a signed URL
// minted server-side for a caller who is already signed in.
//
// The TTL is the announcement-images hour rather than the 60 seconds a
// proof photo gets. These render inline on a page a member may leave open
// while they go and take the photo — a URL that expires under them turns
// the guide into broken images at exactly the moment it is needed. They are
// also the Team Leader's own instructions to the whole team, not one
// person's evidence, so a longer window exposes far less.

const BUCKET = "task-samples";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Enough to show a good example, a bad one, and a close-up. */
export const MAX_SAMPLE_PHOTOS = 3;
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;

export async function uploadTaskSamplePhoto(path: string, mimeType: string, buffer: Buffer) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[taskSampleStorage] upload failed:", error);
    return { ok: false as const, error: "Couldn't upload that sample photo. Please try again." };
  }
  return { ok: true as const, path };
}

/**
 * Signed URLs for many paths at once, keyed by path.
 *
 * One call rather than one per image: the tasks page renders every task the
 * viewer can see, and a handful of samples each would otherwise be dozens of
 * round trips before it could render. A path that fails to sign comes back
 * missing rather than failing the page — one bad sample must not blank the
 * task it belongs to.
 */
export async function signTaskSamplePhotos(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return urls;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[taskSampleStorage] sign failed:", error);
    return urls;
  }
  for (const d of data) {
    if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return urls;
}

export async function deleteTaskSamplePhotos(paths: string[]) {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) console.error("[taskSampleStorage] delete failed:", error);
}

/**
 * A storage key that keeps the original name readable without trusting it —
 * same shape as the announcement and proof uploads.
 */
export function taskSamplePath(ownerId: string, index: number, fileName: string) {
  return `${ownerId}/${Date.now()}-${index}-${fileName.replace(/[^\w.\-]/g, "_")}`;
}
