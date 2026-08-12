import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/database.types";

type InviteMemberInput = {
  psid: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  mobile_number?: string | null;
  role: AppRole;
  siteUrl: string;
};

type InviteMemberResult = { ok: true } | { ok: false; error: string };

// Shared by /api/team (manual "Add member") and the access-request approval
// flow — both need the exact same "invite the auth user, then create the
// matching profiles row, rolling back the orphaned auth user on failure"
// sequence.
export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const admin = createAdminClient();

  // See README gotchas: redirectTo must point at a public page, and the
  // actual link a person clicks comes from Supabase's email template (which
  // should use {{ .TokenHash }} -> /auth/confirm, not {{ .ConfirmationURL }}
  // directly) to survive email link prefetching. redirectTo here is mostly
  // a fallback/consistency value.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${input.siteUrl}/reset-password`,
  });
  if (inviteError || !invited?.user) {
    return { ok: false, error: inviteError?.message ?? "Couldn't create the account for that email." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    psid: input.psid,
    first_name: input.first_name,
    middle_name: input.middle_name || null,
    last_name: input.last_name,
    email: input.email,
    mobile_number: input.mobile_number || null,
    role: input.role,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { ok: false, error: profileError.message };
  }

  return { ok: true };
}
