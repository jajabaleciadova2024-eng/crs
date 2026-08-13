import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatFullName } from "@/lib/format";
import type { LeaveCalendarRequest } from "@/lib/leaveCalendar";

// RLS on leave_requests restricts SELECT to your own rows or leader/OIC
// (see "leave_requests_select_own_or_leadership"), but the calendar is
// meant to be visible to everyone -- so this deliberately goes through the
// service-role client, and only ever projects the minimal, non-sensitive
// fields needed to plot a day (name, type, status, dates). It never
// touches reason, document_path, or anything else private to the request.
export async function getLeaveCalendarRequests(): Promise<LeaveCalendarRequest[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leave_requests")
    .select(
      "id, leave_type, start_date, end_date, status, profiles!leave_requests_associate_id_fkey(first_name, last_name), leave_request_ranges(start_date, end_date)"
    )
    .in("status", ["pending", "approved"]);

  return (data ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any;
    return {
      id: row.id as string,
      name: formatFullName(row.profiles?.first_name, row.profiles?.last_name) || "Unknown",
      leave_type: row.leave_type as string,
      status: row.status as "pending" | "approved",
      ranges: [{ start_date: row.start_date, end_date: row.end_date }, ...(row.leave_request_ranges ?? [])],
    };
  });
}
