import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Permanently removes a team member: deletes their profiles row and their
// Supabase Auth account (via the service-role admin client). Restricted to
// Team Leader — verified against the caller's own session before touching
// the admin client. Irreversible — the UI confirms before calling this
// (see MemberRow.tsx); this route doesn't second-guess that.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can remove members." }, { status: 403 });
  }

  if (id === user.id) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Profile row first — assignments/leave_requests/notification_prefs
  // cascade-delete with the profile (see 0001_init.sql), but
  // schedule_weeks.generated_by and leave_requests/access_requests's
  // reviewed_by don't (no ON DELETE clause = restrict). Those only ever
  // get set to a Team Leader's id (only role that generates/reviews), so
  // this should only realistically bite when removing a FORMER Team
  // Leader who has history on record — surface that plainly instead of
  // a raw Postgres FK error.
  const { error: profileError } = await admin.from("profiles").delete().eq("id", id);
  if (profileError) {
    const message =
      profileError.code === "23503"
        ? "Can't remove this member — they have schedule/review history on record (likely a former Team Leader). Deactivate instead of removing."
        : profileError.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
