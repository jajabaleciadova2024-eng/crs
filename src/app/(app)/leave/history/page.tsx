import Link from "next/link";
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentQueueWeekStart } from "@/lib/scheduleDates";
import { Panel, Pill, PageHeader } from "@/components/ui";
import { getPayPeriod } from "@/lib/payPeriod";
import { formatLeaveRanges } from "@/lib/leaveFormat";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";
import { formatFullName } from "@/lib/format";
import { DocumentLinks } from "../DocumentUpload";
import type { LeaveStatus } from "@/lib/database.types";

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

export default async function LeaveHistoryPage() {
  const profile = await requireProfile();
  // Same visibility split as the Queue: Team Leader + OIC see everyone's
  // history, an associate sees only their own.
  const canViewAll = isApprover(profile.role);
  // Download (inside the document popup) is Team Leader only, narrower
  // than canViewAll -- OIC and the owner themselves can still View.
  const canDownload = profile.role === "team_leader";

  const supabase = await createClient();
  // History is everything that's rolled OUT of the Queue's current-week
  // window -- the two pages are mirrors of each other split only by time,
  // so they share the exact same columns/formatting (see leave/page.tsx).
  const weekStart = currentQueueWeekStart();
  const historyQuery = supabase
    .from("leave_requests")
    // Must disambiguate: leave_requests has two FKs to profiles
    // (associate_id, reviewed_by) — see /leave/page.tsx for the full note.
    // review_note covers two cases: the rejection reason, and the
    // Team-Leader-override note when approving a request that still has no
    // document (see LeaveQueueTable).
    .select(
      "id, associate_id, leave_type, start_date, end_date, status, document_path, reviewed_at, review_note, final_rejection, is_half_day, profiles!leave_requests_associate_id_fkey(first_name, last_name, avatar_url), leave_request_ranges(start_date, end_date)"
    )
    // Approved requests appear here IMMEDIATELY on approval (no reviewed_at
    // cutoff) — the Queue drops them the moment they're decided. Rejected
    // ones still roll in on the weekly schedule, and only once they're out
    // of an open reject -> re-upload -> re-review cycle: rejected WITH a
    // document AND not finally rejected stays in the Queue instead
    // (document_path is only ever set for that behavior type). The
    // reviewed_at cutoff is folded into the rejected branches rather than
    // applied to the whole query, so the two pages stay non-overlapping.
    // See leave/page.tsx for the matching exclusion on the Queue side.
    .or(
      `status.eq.approved,and(status.eq.rejected,reviewed_at.lt.${weekStart},document_path.is.null),and(status.eq.rejected,reviewed_at.lt.${weekStart},final_rejection.eq.true)`
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
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    {canViewAll && <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>}
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Document</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Decided on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = (r as any).profiles;
                    const typeConfig = leaveTypeConfigs.find((c) => c.key === r.leave_type);
                    return (
                      <tr key={r.id}>
                        {canViewAll && (
                          <td className="py-2.5 border-b border-[var(--line)]">{formatFullName(p?.first_name, p?.last_name)}</td>
                        )}
                        <td className="py-2.5 border-b border-[var(--line)] capitalize">
                          <div className="flex items-center gap-1.5">
                            <span>{typeConfig?.label ?? r.leave_type}</span>
                            {r.is_half_day && <Pill>Half Day</Pill>}
                            {typeConfig?.behavior === "auto_approve_document" && r.status === "approved" && !r.document_path && !r.is_half_day && (
                              <Pill tone="warn">Approved w/o document</Pill>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          {formatLeaveRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges)}
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                          {r.status === "rejected" && r.final_rejection && (
                            <div className="text-[10.5px] font-bold text-[var(--bad)] mt-1">Final — closed</div>
                          )}
                          {r.review_note && (r.status === "rejected" || (r.status === "approved" && !r.document_path)) && (
                            <div className="text-[10.5px] text-[var(--muted)] mt-1 max-w-[180px]">{r.review_note}</div>
                          )}
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          {typeConfig?.behavior === "auto_approve_document" ? (
                            r.document_path ? (
                              <DocumentLinks requestId={r.id} canDownload={canDownload} />
                            ) : (
                              <span className="text-[var(--muted)]">Not uploaded</span>
                            )
                          ) : (
                            <span className="text-[var(--muted)]">N/A</span>
                          )}
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
                          {r.reviewed_at ? new Date(r.reviewed_at).toISOString().slice(0, 10) : "—"}
                        </td>
                      </tr>
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
