import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui";
import { getLeaveCalendarRequests } from "@/lib/leaveCalendarData";
import { buildLeaveDayMap } from "@/lib/leaveCalendar";
import { todayInManila } from "@/lib/scheduleDates";
import { DEFAULT_LEAVE_TYPE_CONFIGS } from "@/lib/leaveTypes";
import LeaveCalendar from "./LeaveCalendar";

// Read-only, visible to every signed-in role -- just plots which dates
// have a pending or approved leave request on them, org-wide. See
// src/lib/leaveCalendarData.ts for why this bypasses the normal
// own-rows-only RLS (via a tightly-scoped service-role read).
export default async function LeaveCalendarPage() {
  await requireProfile();
  const supabase = await createClient();

  const [requests, { data: orgSettings }] = await Promise.all([
    getLeaveCalendarRequests(),
    supabase.from("org_settings").select("leave_type_configs").limit(1).maybeSingle(),
  ]);
  const leaveTypeConfigs = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;
  const dayMap = buildLeaveDayMap(requests);
  const today = todayInManila();

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl m-0 mb-1">Leave Calendar</h1>
            <p className="text-sm text-[var(--muted)] m-0">Every pending or approved leave request, org-wide</p>
          </div>
          <Link href="/leave" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Leave Requests
          </Link>
        </div>
      </header>

      <Panel title="Calendar">
        <LeaveCalendar dayMap={dayMap} leaveTypeConfigs={leaveTypeConfigs} today={today} />
      </Panel>
    </>
  );
}
