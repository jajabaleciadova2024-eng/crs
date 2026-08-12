import { requireProfile, isApprover, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

  const listQuery = supabase
    .from("leave_requests")
    .select("*, profiles(first_name, last_name), leave_request_ranges(start_date, end_date)")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const [{ data: orgSettings }, { data: requests }] = await Promise.all([
    supabase.from("org_settings").select("*").limit(1).maybeSingle(),
    canViewAll ? listQuery : listQuery.eq("associate_id", profile.id),
  ]);
  const leaveTypeConfigs = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Leave Requests</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          {canViewAll ? "Track requests from your team" : "File a request and track your leave history"}
        </p>
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
