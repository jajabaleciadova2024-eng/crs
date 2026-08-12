import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
