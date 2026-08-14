import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyAccessRequestDecision } from "@/lib/notify";

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
    return NextResponse.json({ error: "Only the Team Leader can reject access requests." }, { status: 403 });
  }

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Let the requester know — without this they just never hear back.
  await notifyAccessRequestDecision(id, "rejected");

  return NextResponse.json({ ok: true });
}
