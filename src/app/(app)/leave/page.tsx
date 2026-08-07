// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill, Avatar } from "@/components/ui";
import LeaveRequestForm from "./LeaveRequestForm";
import ApprovalActions from "./ApprovalActions";
import type { LeaveStatus } from "@/lib/database.types";

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

export default async function LeavePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const approver = isApprover(profile.role);

  const { data: orgSettings } = await supabase.from("org_settings").select("*").limit(1).maybeSingle();

  const listQuery = supabase
    .from("leave_requests")
    .select("*, profiles(first_name, last_name)")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: requests } = approver ? await listQuery : await listQuery.eq("associate_id", profile.id);

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Leave Requests</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          {approver ? "Review and act on requests from your team" : "File a request and track your leave history"}
        </p>
      </header>

      <div className={approver ? "grid grid-cols-1 gap-4" : "grid grid-cols-[1.3fr_1fr] gap-4 items-start"}>
        <Panel title="Queue" hint={`${pendingCount} pending`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {approver && <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>}
                  <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
                  <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
                  <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Reason</th>
                  <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
                  {approver && <th className="py-2.5 border-b border-[var(--line)]" />}
                </tr>
              </thead>
              <tbody>
                {requests && requests.length > 0 ? (
                  requests.map((r: any) => (
                    <tr key={r.id}>
                      {approver && (
                        <td className="py-2.5 border-b border-[var(--line)]">
                          <span className="flex items-center">
                            <Avatar firstName={r.profiles?.first_name ?? ""} lastName={r.profiles?.last_name ?? ""} />
                            {r.profiles?.first_name} {r.profiles?.last_name}
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 border-b border-[var(--line)] capitalize">{r.leave_type}</td>
                      <td className="py-2.5 border-b border-[var(--line)]">
                        {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                      </td>
                      <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.reason ?? "—"}</td>
                      <td className="py-2.5 border-b border-[var(--line)]">
                        <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                      </td>
                      {approver && (
                        <td className="py-2.5 border-b border-[var(--line)]">
                          {r.status === "pending" && r.associate_id !== profile.id ? (
                            <ApprovalActions requestId={r.id} reviewerId={profile.id} />
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={approver ? 6 : 4} className="py-4 text-[var(--muted)]">
                      No leave requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {!approver && (
          <Panel title="File a request">
            <LeaveRequestForm associateId={profile.id} requireReason={orgSettings?.require_leave_reason ?? true} />
          </Panel>
        )}
      </div>
    </>
  );
}
