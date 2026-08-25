import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyApproversNewLeave } from "@/lib/notify";
import { hasVacationConflict } from "@/lib/leaveConflict";
import { DEFAULT_LEAVE_TYPE_CONFIGS, findLeaveTypeConfig, type LeaveTypeConfig } from "@/lib/leaveTypes";

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

  await notifyApproversNewLeave(inserted.id);

  return NextResponse.json({ ok: true, id: inserted.id, flagged_conflict: flaggedConflict });
}
