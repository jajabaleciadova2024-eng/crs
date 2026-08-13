import Link from "next/link";
import { requireProfile, isApprover, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentQueueWeekStart } from "@/lib/scheduleDates";
import { Panel } from "@/components/ui";
import LeaveRequestForm from "./LeaveRequestForm";
import LeaveQueueTable from "./LeaveQueueTable";
import { DEFAULT_LEAVE_TYPE_CONFIGS } from "@/lib/leaveTypes";

export default async function LeavePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // canViewAll: sees everyone's requests, not just their own (Team Leader + OIC).
  // canManage: can approve/reject (Team Leader only).
  const canViewAll = isApprover(profile.role);
  const canManage = canManageOperations(profile.role);

  // The Queue mirrors History in every way except its time window: pending
  // requests always show here, but decided (approved/rejected) ones only
  // stay in the Queue through the current week -- they roll over into
  // History once Monday 8am (Manila) has passed. This keeps the Queue from
  // filling up with old decided requests while still giving everyone a few
  // days to see how a recent request was decided.
  const weekStart = currentQueueWeekStart();
  const listQuery = supabase
    .from("leave_requests")
    // leave_requests has two FKs to profiles (associate_id, reviewed_by) —
    // must name which one, otherwise PostgREST errors with "more than one
    // relationship was found" and the whole query returns null (this was
    // silently emptying the queue for every account).
    .select("*, profiles!leave_requests_associate_id_fkey(first_name, last_name), leave_request_ranges(start_date, end_date)")
    .or(`status.eq.pending,reviewed_at.gte.${weekStart}`)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const [{ data: orgSettings }, { data: requests }] = await Promise.all([
    supabase.from("org_settings").select("*").limit(1).maybeSingle(),
    canViewAll ? listQuery : listQuery.eq("associate_id", profile.id),
  ]);
  const leaveTypeConfigs = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  // Viewing this page acknowledges any of the viewer's own requests that
  // have since been decided, clearing their sidebar badge -- unconditional
  // (not scoped to what's currently in the Queue window) since a decided
  // request can age out of the Queue into History before the owner checks.
  // Run via the admin client since RLS only lets an owner update their OWN
  // request while it's still pending, not after it's been decided.
  const admin = createAdminClient();
  await admin.from("leave_requests").update({ seen_by_associate: true }).eq("associate_id", profile.id).eq("seen_by_associate", false);

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl m-0 mb-1">Leave Requests</h1>
            <p className="text-sm text-[var(--muted)] m-0">
              {canViewAll ? "Track requests from your team" : "File a request and track your leave history"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/leave/calendar" className="text-xs font-bold text-[var(--accent-strong)]">
              View calendar →
            </Link>
            <Link href="/leave/history" className="text-xs font-bold text-[var(--accent-strong)]">
              View history →
            </Link>
          </div>
        </div>
      </header>

      <div className={canViewAll ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 items-start"}>
        <Panel title="Queue" hint={`${pendingCount} pending`}>
          <div className="overflow-x-auto">
            <LeaveQueueTable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              requests={(requests ?? []) as any}
              leaveTypeConfigs={leaveTypeConfigs}
              requireReason={orgSettings?.require_leave_reason ?? true}
              viewerId={profile.id}
              canViewAll={canViewAll}
              canManage={canManage}
            />
          </div>
        </Panel>

        {!canViewAll && (
          <Panel title="File a request">
            <LeaveRequestForm leaveTypeConfigs={leaveTypeConfigs} requireReason={orgSettings?.require_leave_reason ?? true} />
          </Panel>
        )}
      </div>
    </>
  );
}
