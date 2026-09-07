import { NextResponse } from "next/server";
import { bellNotify, resolveBellNotices, leaveReviewerIds } from "@/lib/bellNotify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasVacationConflict, recomputeVacationConflicts } from "@/lib/leaveConflict";
import { DEFAULT_LEAVE_TYPE_CONFIGS, findLeaveTypeConfig, type LeaveTypeConfig } from "@/lib/leaveTypes";
import { countBlockingTasks } from "@/lib/taskBlockingServer";
import { credentialBlock } from "@/lib/passwordBlockingServer";

// Lets the requester edit their OWN request while it's still pending or
// rejected (non-final). Pending uses RLS; rejected uses the admin client
// (RLS only allows pending updates) and resets the request back to pending
// so it re-enters the approval flow.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json();
  const { leave_type, ranges, reason, is_half_day } = body ?? {};

  if (!leave_type || !Array.isArray(ranges) || ranges.length === 0) {
    return NextResponse.json({ error: "Leave type and at least one date range are required." }, { status: 400 });
  }
  for (const r of ranges) {
    if (!r?.start_date || !r?.end_date) {
      return NextResponse.json({ error: "Every date range needs a start and end date." }, { status: 400 });
    }
    if (r.end_date < r.start_date) {
      return NextResponse.json({ error: "A date range's end can't be before its start." }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data: orgSettings } = await admin.from("org_settings").select("leave_type_configs").limit(1).maybeSingle();
  const configs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;
  const typeConfig = findLeaveTypeConfig(configs, leave_type);
  if (!typeConfig) {
    return NextResponse.json({ error: "That leave type doesn't exist anymore — refresh and try again." }, { status: 400 });
  }

  let flaggedConflict = false;
  if (typeConfig.behavior === "vacation_conflict") {
    const vacationKeys = configs.filter((c) => c.behavior === "vacation_conflict").map((c) => c.key);
    flaggedConflict = await hasVacationConflict(vacationKeys, ranges, id);
  }

  const [primary, ...extra] = ranges;

  // Check ownership and current status before updating.
  const { data: existing } = await supabase
    .from("leave_requests")
    .select("associate_id, status, final_rejection")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.associate_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own request." }, { status: 403 });
  }
  if (existing.status !== "pending" && existing.status !== "rejected") {
    return NextResponse.json({ error: "That request can no longer be edited." }, { status: 400 });
  }
  if (existing.status === "rejected" && existing.final_rejection) {
    return NextResponse.json({ error: "This request was finally rejected and cannot be edited." }, { status: 400 });
  }

  const isRejectedResubmit = existing.status === "rejected";

  if (isRejectedResubmit) {
    const { data: filerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (filerProfile && filerProfile.role !== "team_leader") {
      const cred = await credentialBlock(user.id);
      if (cred.blocking) {
        return NextResponse.json(
          { error: "Reset your password and have it confirmed before resubmitting a leave request." },
          { status: 403 },
        );
      }
      const blocking = await countBlockingTasks(user.id, "leave");
      if (blocking > 0) {
        return NextResponse.json(
          { error: `You have ${blocking} pending task${blocking !== 1 ? "s" : ""} to complete before resubmitting a leave request.` },
          { status: 403 },
        );
      }
    }
  }
  const updateFields = {
    leave_type,
    start_date: primary.start_date,
    end_date: primary.end_date,
    reason: reason || null,
    flagged_conflict: flaggedConflict,
    is_half_day: Boolean(is_half_day),
    ...(isRejectedResubmit && {
      status: "pending" as const,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      seen_by_associate: false,
      final_rejection: false,
    }),
  };

  // Pending requests go through RLS; rejected ones need the admin client
  // because RLS only allows updates on pending rows.
  const updateClient = isRejectedResubmit ? admin : supabase;
  const { error, count } = await updateClient
    .from("leave_requests")
    .update(updateFields, { count: "exact" })
    .eq("id", id)
    .eq("associate_id", user.id)
    .eq("status", isRejectedResubmit ? "rejected" : "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "That request can no longer be edited." }, { status: 400 });
  }

  // Replace extra ranges — use admin client when resubmitting a rejected
  // request since the range RLS may also be gated on pending status.
  const rangeClient = isRejectedResubmit ? admin : supabase;
  await rangeClient.from("leave_request_ranges").delete().eq("leave_request_id", id);
  if (extra.length > 0) {
    await rangeClient.from("leave_request_ranges").insert(
      extra.map((r: { start_date: string; end_date: string }) => ({
        leave_request_id: id,
        start_date: r.start_date,
        end_date: r.end_date,
      }))
    );
  }

  // Changed dates/type here can resolve a conflict for the request being
  // edited, or newly create one for some OTHER pending request — recompute
  // everyone's flag, not just this one.
  await recomputeVacationConflicts();

  if (isRejectedResubmit) {
    await resolveBellNotices("leave_reviewed", id);
    await bellNotify(await leaveReviewerIds(), user.id, "leave_submitted", null, id);
  } else {
    await bellNotify(await leaveReviewerIds(), user.id, "leave_updated", null, id);
  }


  return NextResponse.json({ ok: true, flagged_conflict: flaggedConflict });
}
