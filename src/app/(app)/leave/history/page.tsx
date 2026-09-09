import Link from "next/link";
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, PageHeader } from "@/components/ui";
import { getPayPeriod } from "@/lib/payPeriod";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";
import LeaveHistoryRow from "./LeaveHistoryRow";

export default async function LeaveHistoryPage() {
  const profile = await requireProfile();
  // Same visibility split as the Queue: Team Leader + OIC see everyone's
  // history, an associate sees only their own.
  const canViewAll = isApprover(profile.role);
  const isTL = profile.role === "team_leader";
  // Download (inside the document popup) is Team Leader only, narrower
  // than canViewAll -- OIC and the owner themselves can still View.
  const canDownload = isTL;

  const supabase = await createClient();
  // History shows approved and finally-rejected requests. Non-final
  // rejections stay in the Queue so the associate can resubmit.
  const historyQuery = supabase
    .from("leave_requests")
    // Must disambiguate: leave_requests has two FKs to profiles
    // (associate_id, reviewed_by) — see /leave/page.tsx for the full note.
    // review_note covers two cases: the rejection reason, and the
    // Team-Leader-override note when approving a request that still has no
    // document (see LeaveQueueTable).
    .select(
      "id, associate_id, leave_type, start_date, end_date, status, reason, document_path, reviewed_at, review_note, final_rejection, is_half_day, profiles!leave_requests_associate_id_fkey(first_name, last_name, avatar_url), leave_request_ranges(start_date, end_date)"
    )
    // Approved requests appear here IMMEDIATELY on approval (no reviewed_at
    // cutoff) — the Queue drops them the moment they're decided. Only
    // finally-rejected requests appear here — non-final rejections stay in
    // the Queue so the associate can resubmit or upload a document.
    // See leave/page.tsx for the matching Queue filter.
    .or(
      `status.eq.approved,and(status.eq.rejected,final_rejection.eq.true)`
    )
    .order("start_date", { ascending: false });

  const [{ data: orgSettings }, { data: decided }] = await Promise.all([
    supabase.from("org_settings").select("leave_type_configs").limit(1).maybeSingle(),
    canViewAll ? historyQuery : historyQuery.eq("associate_id", profile.id),
  ]);
  const leaveTypeConfigs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const periods = new Map<string, { label: string; rows: NonNullable<typeof decided> }>();
  for (const r of decided ?? []) {
    const period = getPayPeriod(r.start_date);
    if (!periods.has(period.key)) {
      periods.set(period.key, { label: period.label, rows: [] });
    }
    periods.get(period.key)!.rows.push(r);
  }
  // Map insertion order follows the query's start_date desc order, so
  // periods naturally come out most-recent-first already.

  return (
    <>
      <PageHeader
        title="Leave History"
        subtitle="Decided leave, grouped by semi-monthly period (1st–15th, 16th–end of month) — approvals land here immediately, rejections roll over from the Queue each Monday"
        action={
          <Link href="/leave" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Leave Requests
          </Link>
        }
      />

      {periods.size === 0 ? (
        <Panel title="No decided leave yet">
          <p className="text-sm text-[var(--muted)] m-0">Once requests are approved or rejected, they&apos;ll show up here grouped by period.</p>
        </Panel>
      ) : (
        Array.from(periods.entries()).map(([key, { label, rows }]) => (
          <Panel key={key} title={label} hint={`${rows.length} decided`}>
            <div className="overflow-x-auto scroll-shadow-x">
              <table className="w-full text-[13px] border-collapse min-w-[520px]">
                <thead>
                  <tr>
                    <th className="w-0 border-b border-[var(--line)]"><span className="sr-only">Expand</span></th>
                    {canViewAll && <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Associate</th>}
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Type</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Dates</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Status</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Decided</th>
                    {isTL && <th className="w-0 border-b border-[var(--line)]"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const typeConfig = leaveTypeConfigs.find((c) => c.key === r.leave_type);
                    return (
                      <LeaveHistoryRow
                        key={r.id}
                        r={r as any}
                        canViewAll={canViewAll}
                        canDownload={canDownload}
                        isTL={isTL}
                        typeConfig={typeConfig ? { key: typeConfig.key, label: typeConfig.label, behavior: typeConfig.behavior } : undefined}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </>
  );
}
