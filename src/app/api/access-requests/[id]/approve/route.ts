import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteMember } from "@/lib/inviteMember";

// Approving an access request runs the exact same invite as /team's "Add
// member" — the requester gets the same invite email. Team Leader only,
// since this is the same authority level as adding a member manually.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "Only the Team Leader can approve access requests." }, { status: 403 });
  }

  const body = await request.json();
  const { psid, role } = body ?? {};
  if (!psid || !role) {
    return NextResponse.json({ error: "PSID and role are required." }, { status: 400 });
  }
  if (!["team_leader", "oic", "associate"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: accessRequest } = await admin
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (!accessRequest) {
    return NextResponse.json({ error: "That request is no longer pending." }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const result = await inviteMember({
    psid,
    first_name: accessRequest.first_name,
    last_name: accessRequest.last_name,
    email: accessRequest.email,
    mobile_number: accessRequest.mobile_number,
    role,
    siteUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await admin
    .from("access_requests")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
