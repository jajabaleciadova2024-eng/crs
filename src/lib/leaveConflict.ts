import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";

export type DateRange = { start_date: string; end_date: string };

function rangesOverlap(a: DateRange, b: DateRange) {
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

// Org-wide "1 person on leave per day" check for vacation-conflict-behavior
// leave types: true if any of `newRanges` overlaps another pending/approved
// request (from anyone, including the same associate) of one of
// `vacationTypeKeys`. Uses the admin client since this has to see across
// every associate's requests, not just the caller's own (RLS would
// otherwise hide everyone else's rows from a plain associate). Soft check
// only — callers decide whether to warn or block; this never blocks by
// itself.
export async function hasVacationConflict(
  vacationTypeKeys: string[],
  newRanges: DateRange[],
  excludeRequestId?: string
): Promise<boolean> {
  if (vacationTypeKeys.length === 0 || newRanges.length === 0) return false;

  const admin = createAdminClient();
  let query = admin
    .from("leave_requests")
    .select("id, start_date, end_date, leave_request_ranges(start_date, end_date)")
    .in("leave_type", vacationTypeKeys)
    .in("status", ["pending", "approved"]);

  if (excludeRequestId) {
    query = query.neq("id", excludeRequestId);
  }

  const { data: existing } = await query;
  if (!existing) return false;

  for (const req of existing as unknown as {
    start_date: string;
    end_date: string;
    leave_request_ranges: DateRange[] | null;
  }[]) {
    const existingRanges: DateRange[] = [
      { start_date: req.start_date, end_date: req.end_date },
      ...(req.leave_request_ranges ?? []),
    ];
    for (const er of existingRanges) {
      for (const nr of newRanges) {
        if (rangesOverlap(er, nr)) return true;
      }
    }
  }

  return false;
}

// Re-derives `flagged_conflict` for every currently pending/approved
// vacation-conflict-behavior request, org-wide, from scratch.
//
// `hasVacationConflict` above only ever computes the flag for the ONE
// request being filed/edited at that moment — it never revisits the flag
// on the *other* side of a conflict. That left it stale: deleting,
// rejecting, or retyping-away-from-vacation one half of a conflicting pair
// left the other half stuck showing "Possible conflict" forever, since
// nothing ever re-checked it. Call this after any leave-request mutation
// that could add or remove a request from the conflict pool (insert, edit,
// status change, delete) so every request's flag reflects reality again.
export async function recomputeVacationConflicts(): Promise<void> {
  const admin = createAdminClient();
  const { data: orgSettings } = await admin.from("org_settings").select("leave_type_configs").limit(1).maybeSingle();
  const configs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;
  const vacationKeys = configs.filter((c) => c.behavior === "vacation_conflict").map((c) => c.key);
  if (vacationKeys.length === 0) return;

  const { data: rows } = await admin
    .from("leave_requests")
    .select("id, flagged_conflict, start_date, end_date, leave_request_ranges(start_date, end_date)")
    .in("leave_type", vacationKeys)
    .in("status", ["pending", "approved"]);
  if (!rows || rows.length === 0) return;

  const entries = (
    rows as unknown as {
      id: string;
      flagged_conflict: boolean;
      start_date: string;
      end_date: string;
      leave_request_ranges: DateRange[] | null;
    }[]
  ).map((r) => ({
    id: r.id,
    flagged_conflict: r.flagged_conflict,
    ranges: [{ start_date: r.start_date, end_date: r.end_date }, ...(r.leave_request_ranges ?? [])],
  }));

  const updates: { id: string; flagged: boolean }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const conflict = entries.some(
      (other, j) => j !== i && entries[i].ranges.some((a) => other.ranges.some((b) => rangesOverlap(a, b)))
    );
    if (entries[i].flagged_conflict !== conflict) {
      updates.push({ id: entries[i].id, flagged: conflict });
    }
  }
  if (updates.length === 0) return;

  await Promise.all(updates.map((u) => admin.from("leave_requests").update({ flagged_conflict: u.flagged }).eq("id", u.id)));
}
