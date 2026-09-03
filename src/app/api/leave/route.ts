import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyApproversNewLeave } from "@/lib/notify";
import { bellNotify, approverIds } from "@/lib/bellNotify";
import { hasVacationConflict, recomputeVacationConflicts } from "@/lib/leaveConflict";
import { DEFAULT_LEAVE_TYPE_CONFIGS, findLeaveTypeConfig, type LeaveTypeConfig } from "@/lib/leaveTypes";
import { countBlockingTasks } from "@/lib/taskBlockingServer";
import { credentialBlock } from "@/lib/passwordBlockingServer";

// Files a leave request as the signed-in associate (insert respects the
// existing "leave_requests_insert_own" RLS policy — no admin client for the
// main insert), then notifies the Team Leader if enabled.
//
// Supports non-consecutive dates: `ranges` beyond the first become rows in
// leave_request_ranges, the first becomes the primary start_date/end_date.
// For vacation-conflict-behavior types, does an org-wide overlap check
// (soft — never blocks submission, just flags it for the Team Leader).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Task gate. The Leave page hides the filing form when a task is
  // blocking, but that is presentation only — this is a write, so it has to
  // be enforced here or a direct POST walks straight past it. The Team
  // Leader never files through this route, so the check costs them nothing.
  const { data: filerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (filerProfile && filerProfile.role !== "team_leader") {
    const cred = await credentialBlock(user.id);
    if (cred.blocking) {
      return NextResponse.json(
        { error: "Reset your password and have it confirmed before filing a leave request." },
        { status: 403 },
      );
    }
    const blocking = await countBlockingTasks(user.id, "leave");
    if (blocking > 0) {
      return NextResponse.json(
        {
          error: `You have ${blocking} pending task${blocking !== 1 ? "s" : ""} to complete before filing a leave request.`,
        },
        { status: 403 },
      );
    }
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
    flaggedConflict = await hasVacationConflict(vacationKeys, ranges);
  }

  const [primary, ...extra] = ranges;

  const { data: inserted, error } = await supabase
    .from("leave_requests")
    .insert({
      associate_id: user.id,
      leave_type,
      start_date: primary.start_date,
      end_date: primary.end_date,
      reason: reason || null,
      flagged_conflict: flaggedConflict,
      is_half_day: Boolean(is_half_day),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit your request." }, { status: 400 });
  }

  if (extra.length > 0) {
    await supabase.from("leave_request_ranges").insert(
      extra.map((r: { start_date: string; end_date: string }) => ({
        leave_request_id: inserted.id,
        start_date: r.start_date,
        end_date: r.end_date,
      }))
    );
  }

  // This new request can itself be the thing that puts an EXISTING pending
  // request into conflict for the first time — recompute everyone's flag,
  // not just the one just inserted.
  if (typeConfig.behavior === "vacation_conflict") {
    await recomputeVacationConflicts();
  }

  await notifyApproversNewLeave(inserted.id);
  await bellNotify(await approverIds(), user.id, "leave_submitted");

  return NextResponse.json({ ok: true, id: inserted.id, flagged_conflict: flaggedConflict });
}
