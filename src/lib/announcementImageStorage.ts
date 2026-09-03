import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Images attached to an announcement. Private bucket, same posture as
// task-photos and leave-documents: no storage.objects policies exist, so
// there is no direct client access — every read is a signed URL minted by
// an API route that has already checked the caller is signed in.
//
// The TTL is long by this app's standards (an hour, against 60s for a proof
// screenshot). These are read inline in a feed the reader may leave open,
// and a URL that expires under them turns the announcement into broken
// images. They are also org-wide notices rather than one person's evidence,
// so the exposure a longer window buys is far smaller.

const BUCKET = "announcement-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function uploadAnnouncementImage(path: string, mimeType: string, buffer: Buffer) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[announcementImageStorage] upload failed:", error);
    return { ok: false as const, error: "Couldn't upload that image. Please try again." };
  }
  return { ok: true as const, path };
}

/**
 * Signed URLs for many paths at once, returned in the order asked for.
 *
 * One call rather than one per image: an announcements page holding twenty
 * posts with a few images each would otherwise fire dozens of round trips
 * before it could render. A path that fails to sign comes back null so one
 * bad image cannot blank the rest.
 */
export async function signAnnouncementImages(paths: string[]): Promise<(string | null)[]> {
  if (paths.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[announcementImageStorage] sign failed:", error);
    return paths.map(() => null);
  }
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl ?? null]));
  return paths.map((p) => byPath.get(p) ?? null);
}

export async function deleteAnnouncementImages(paths: string[]) {
  if (paths.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) console.error("[announcementImageStorage] delete failed:", error);
}
