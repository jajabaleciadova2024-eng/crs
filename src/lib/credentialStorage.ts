import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Password-reset proof screenshots. Private bucket, no storage.objects
// policies — identical posture to task-photos and leave-documents: reads are
// only ever mediated by an API route that authorises the caller first.

const BUCKET = "password-proofs";
const SIGNED_URL_TTL_SECONDS = 60;

export async function uploadResetProof(path: string, mimeType: string, buffer: Buffer) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[credentialStorage] upload failed:", error);
    return { ok: false as const, error: "Couldn't upload the screenshot. Please try again." };
  }
  return { ok: true as const, path };
}

export async function getResetProofUrl(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
