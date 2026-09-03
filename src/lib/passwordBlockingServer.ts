import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPasswordBlocking } from "@/lib/passwordExpiry";

// A member's credential row, and whether it is currently blocking them.
//
// Admin client on purpose: credential_status is readable by everyone under
// RLS, but this runs in layouts and pages that already act on the member's
// behalf, and using one client keeps the blocking decision identical
// wherever it is asked.
export async function credentialBlock(profileId: string): Promise<{
  lastResetAt: string | null;
  blocking: boolean;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("credential_status")
    .select("last_reset_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  const lastResetAt = (data?.last_reset_at as string | null) ?? null;
  return { lastResetAt, blocking: isPasswordBlocking(lastResetAt) };
}
