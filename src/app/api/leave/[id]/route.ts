import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyLeaveStatusChange } from "@/lib/notify";
import { DEFAULT_LEAVE_TYPE_CONFIGS, findLeaveTypeConfig, type LeaveTypeConfig } from "@/lib/leaveTypes";
import { recomputeVacationConflicts } from "@/lib/leaveConflict";

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
  const { status, note, final } = body ?? {};
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  // A rejection needs a reason attached so the associate knows why —
  // required here too, not just by the modal client-side.
  if (status === "rejected" && !String(note ?? "").trim()) {
    return NextResponse.json({ error: "A note is required when rejecting a request." }, { status: 400 });
  }

  // Pre-approved types (Sick/Bereavement) can be filed before the document
  // is in hand, but can't actually be approved until it's uploaded —
  // enforced here too, not just by disabling the button client-side, since
  // this route can be hit directly.
  if (status === "approved") {
    const { data: leaveRequest } = await supabase.from("leave_requests").select("leave_type, document_path").eq("id", id).single();
    if (leaveRequest) {
      const { data: orgSettings } = await supabase.from("org_settings").select("leave_type_configs").limit(1).maybeSingle();
      const configs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;
      const typeConfig = findLeaveTypeConfig(configs, leaveRequest.leave_type);
      if (typeConfig?.behavior === "auto_approve_document" && !leaveRequest.document_path) {
        return NextResponse.json({ error: "This request needs a supporting document uploaded before it can be approved." }, { status: 400 });
      }
    }
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      seen_by_associate: false,
      review_note: status === "rejected" ? String(note).trim() : null,
      // A final rejection ends the reject -> re-upload -> re-review cycle
      // for good (see 0012_leave_final_rejection.sql) -- reset to false
      // on approval too, so a fresh cycle starts clean if this row is
      // ever reused.
      final_rejection: status === "rejected" && Boolean(final),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // A rejection removes this request from the vacation-conflict pool, which
  // can clear the "Possible conflict" flag on whatever it used to overlap.
  if (status === "rejected") {
    await recomputeVacationConflicts();
  }

  await notifyLeaveStatusChange(id);

  return NextResponse.json({ ok: true });
}

// Two callers, two RLS policies:
//  - The requester cancelling their OWN request while it's still pending
//    ("leave_requests_delete_own_pending").
//  - The Team Leader deleting ANY request regardless of status — e.g.
//    removing an approved leave entered in error
//    ("leave_requests_delete_team_leader", see 0021_leave_delete_team_leader.sql).
// No admin client either way — RLS alone decides what actually gets deleted.
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
  const isTeamLeader = callerProfile?.role === "team_leader";

  let query = supabase.from("leave_requests").delete({ count: "exact" }).eq("id", id);
  // A Team Leader can delete any request, any status; anyone else can only
  // delete their own while it's still pending — matching the RLS policies.
  if (!isTeamLeader) {
    query = query.eq("associate_id", user.id).eq("status", "pending");
  }
  const { error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "That request can no longer be cancelled." }, { status: 400 });
  }

  // Deleting a request removes it from the vacation-conflict pool, which
  // can clear the "Possible conflict" flag on whatever it used to overlap
  // (this is the whole reason the Team Leader deletes an approved leave —
  // e.g. it turned out to be the one causing the conflict).
  await recomputeVacationConflicts();

  return NextResponse.json({ ok: true });
}
