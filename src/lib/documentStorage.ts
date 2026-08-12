import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Leave-request supporting documents (medical certificates, bereavement
// proof, etc.) live in a private Supabase Storage bucket. Every function
// here uses the service-role admin client, so it bypasses RLS entirely —
// there are no storage.objects policies granting direct client access on
// purpose. Access is always mediated by our own API routes, which check
// "are you the owner, or the Team Leader?" before ever generating a link.

const BUCKET = "leave-documents";
const SIGNED_URL_TTL_SECONDS = 60;

export async function uploadLeaveDocument(path: string, mimeType: string, buffer: Buffer) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[documentStorage] upload failed:", error);
    return { ok: false as const, error: "Couldn't upload the document. Please try again." };
  }
  return { ok: true as const, path };
}

// Short-lived signed URLs — one for viewing inline, one that forces a
// download — generated fresh on every request rather than stored, since
// they expire quickly by design.
export async function getLeaveDocumentLinks(path: string, downloadFileName: string) {
  const admin = createAdminClient();

  const [viewResult, downloadResult] = await Promise.all([
    admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
    admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: downloadFileName }),
  ]);

  if (viewResult.error || !viewResult.data || downloadResult.error || !downloadResult.data) {
    return null;
  }

  return { viewUrl: viewResult.data.signedUrl, downloadUrl: downloadResult.data.signedUrl };
}

export async function deleteLeaveDocument(path: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("[documentStorage] delete failed:", error);
  }
}
