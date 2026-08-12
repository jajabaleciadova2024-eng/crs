import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyLeaveStatusChange } from "@/lib/notify";

// Approves/rejects a leave request as the signed-in Team Leader (update
// respects the "leave_requests_update_team_leader_not_self" RLS policy — no
// admin client here — but we check explicitly too for a clean error message
// instead of a generic RLS failure), then notifies the requesting associate.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "Only the Team Leader can approve or reject leave requests." }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body ?? {};
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyLeaveStatusChange(id);

  return NextResponse.json({ ok: true });
}

// Lets the requester cancel their OWN request while it's still pending
// (respects "leave_requests_delete_own_pending" RLS — no admin client).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { error, count } = await supabase
    .from("leave_requests")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("associate_id", user.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "That request can no longer be cancelled." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
