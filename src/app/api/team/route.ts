import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inviteMember } from "@/lib/inviteMember";

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const result = await inviteMember({
    psid,
    first_name,
    middle_name,
    last_name,
    email,
    mobile_number,
    role,
    siteUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
