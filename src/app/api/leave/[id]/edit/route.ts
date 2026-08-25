import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasVacationConflict } from "@/lib/leaveConflict";
import { DEFAULT_LEAVE_TYPE_CONFIGS, findLeaveTypeConfig, type LeaveTypeConfig } from "@/lib/leaveTypes";

// Lets the requester edit their OWN request while it's still pending
// (type, dates, reason). Respects "leave_requests_update_own_pending" RLS
// for the parent row; leave_request_ranges are simply wiped and
// re-inserted (simpler and safer than diffing).
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

  // RLS (leave_requests_update_own_pending) enforces: own row, still
  // pending, and stays pending after the update.
  const { error, count } = await supabase
    .from("leave_requests")
    .update(
      {
        leave_type,
        start_date: primary.start_date,
        end_date: primary.end_date,
        reason: reason || null,
        flagged_conflict: flaggedConflict,
        is_half_day: Boolean(is_half_day),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("associate_id", user.id)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "That request can no longer be edited." }, { status: 400 });
  }

  // Replace extra ranges wholesale — RLS (leave_request_ranges_write_own_pending)
  // requires the parent to still be pending, which it just was confirmed to be.
  await supabase.from("leave_request_ranges").delete().eq("leave_request_id", id);
  if (extra.length > 0) {
    await supabase.from("leave_request_ranges").insert(
      extra.map((r: { start_date: string; end_date: string }) => ({
        leave_request_id: id,
        start_date: r.start_date,
        end_date: r.end_date,
      }))
    );
  }

  return NextResponse.json({ ok: true, flagged_conflict: flaggedConflict });
}
