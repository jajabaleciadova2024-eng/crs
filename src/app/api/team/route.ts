import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Adds a new team member: creates the auth user (invite email) via the
// service-role admin client, then creates the matching profiles row.
// Restricted to Team Leader — verified against the caller's own session
// before touching the admin client.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can add members." }, { status: 403 });
  }

  const body = await request.json();
  const { psid, first_name, middle_name, last_name, email, mobile_number, role } = body ?? {};

  if (!psid || !first_name || !last_name || !email || !role) {
    return NextResponse.json({ error: "PSID, first name, last name, email, and role are required." }, { status: 400 });
  }
  if (!["team_leader", "oic", "associate"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited?.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? "Couldn't create the account for that email." },
      { status: 400 }
    );
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    psid,
    first_name,
    middle_name: middle_name || null,
    last_name,
    email,
    mobile_number: mobile_number || null,
    role,
  });

  if (profileError) {
    // Roll back the orphaned auth user so a failed add doesn't leave a
    // dangling account with no roster entry.
    await admin.auth.admin.deleteUser(invited.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
