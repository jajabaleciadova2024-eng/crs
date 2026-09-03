import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Who is on APPROVED leave on a given date.
//
// Same reasoning as leaveCalendarData.ts for using the service-role client:
// RLS on leave_requests limits SELECT to your own rows or leadership, but
// every role needs an accurate coverage figure. Only associate_id is
// projected — never the reason, the document, or anything else private.
//
// Two queries rather than one because a request's extra ranges are
// NON-CONSECUTIVE (see 0006_leave_overhaul.sql) and are not guaranteed to
// sit inside the parent's start/end window, so an overlap test on the
// parent alone would miss a date covered only by a sub-range.
export async function associatesOnLeave(date: string): Promise<Set<string>> {
  const admin = createAdminClient();

  const [{ data: direct }, { data: viaRange }] = await Promise.all([
    admin
      .from("leave_requests")
      .select("associate_id")
      .eq("status", "approved")
      .lte("start_date", date)
      .gte("end_date", date),
    admin
      .from("leave_request_ranges")
      .select("leave_requests!inner(associate_id, status)")
      .lte("start_date", date)
      .gte("end_date", date)
      .eq("leave_requests.status", "approved"),
  ]);

  const ids = new Set<string>();
  for (const r of direct ?? []) {
    const id = (r as { associate_id: string | null }).associate_id;
    if (id) ids.add(id);
  }
  for (const r of viaRange ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (r as any).leave_requests?.associate_id as string | undefined;
    if (id) ids.add(id);
  }
  return ids;
}
