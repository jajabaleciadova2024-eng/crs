import Link from "next/link";
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentQueueWeekStart } from "@/lib/scheduleDates";
import { Panel, Avatar, Pill } from "@/components/ui";
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
    .select(
      "id, associate_id, leave_type, start_date, end_date, status, document_path, reviewed_at, review_note, final_rejection, profiles!leave_requests_associate_id_fkey(first_name, last_name), leave_request_ranges(start_date, end_date)"
    )
    .lt("reviewed_at", weekStart)
    // Approved requests roll in normally; rejected ones roll in unless
    // they're still an open reject -> re-upload -> re-review cycle -- i.e.
    // rejected WITH a document AND not finally rejected stays in the
    // Queue instead (document_path only gets set for that behavior type),
    // so the two pages stay non-overlapping. See leave/page.tsx for the
    // matching inclusion on the Queue side.
    .or("status.eq.approved,and(status.eq.rejected,document_path.is.null),and(status.eq.rejected,final_rejection.eq.true)")
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
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl m-0 mb-1">Leave History</h1>
            <p className="text-sm text-[var(--muted)] m-0">
              Decided leave, grouped by semi-monthly period (1st–15th, 16th–end of month) — rolls over from the Queue every Monday
            </p>
          </div>
          <Link href="/leave" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Leave Requests
          </Link>
        </div>
      </header>

      {periods.size === 0 ? (
        <Panel title="No decided leave yet">
          <p className="text-sm text-[var(--muted)] m-0">Once requests are approved or rejected, they&apos;ll show up here grouped by period.</p>
        </Panel>
      ) : (
        Array.from(periods.entries()).map(([key, { label, rows }]) => (
          <Panel key={key} title={label} hint={`${rows.length} decided`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    {canViewAll && <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>}
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Document</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Decided on</th>
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
                          <td className="py-2.5 border-b border-[var(--line)]">
                            <span className="flex items-center">
                              <Avatar firstName={p?.first_name ?? ""} lastName={p?.last_name ?? ""} />
                              {formatFullName(p?.first_name, p?.last_name)}
                            </span>
                          </td>
                        )}
                        <td className="py-2.5 border-b border-[var(--line)] capitalize">{typeConfig?.label ?? r.leave_type}</td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          {formatLeaveRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges)}
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                          {r.status === "rejected" && r.final_rejection && (
                            <div className="text-[10.5px] font-bold text-[var(--bad)] mt-1">Final — closed</div>
                          )}
                          {r.status === "rejected" && r.review_note && (
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
