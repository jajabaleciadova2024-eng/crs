import Link from "next/link";
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, PageHeader } from "@/components/ui";
import { getPayPeriod } from "@/lib/payPeriod";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";
import LeaveHistoryRow from "./LeaveHistoryRow";

const TH =
  "text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap";

export default async function LeaveHistoryPage() {
  const profile = await requireProfile();
  const canViewAll = isApprover(profile.role);
  const isTL = profile.role === "team_leader";
  const canDownload = isTL;

  const supabase = await createClient();
  const historyQuery = supabase
    .from("leave_requests")
    .select(
      "id, associate_id, leave_type, start_date, end_date, status, reason, document_path, reviewed_at, review_note, final_rejection, is_half_day, profiles!leave_requests_associate_id_fkey(first_name, last_name, avatar_url), leave_request_ranges(start_date, end_date)"
    )
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

  // Chevron + Type + Dates + Status + Decided = 5 fixed columns
  // + Associate (canViewAll) + Actions (isTL)
  const colCount = 5 + (canViewAll ? 1 : 0) + (isTL ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Leave History"
        subtitle="Approved and finally-rejected leave, grouped by pay period"
        action={
          <Link href="/leave" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Leave Requests
          </Link>
        }
      />

      {periods.size === 0 ? (
        <Panel title="No decided leave yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Once requests are approved or rejected, they&apos;ll show up here grouped by period.
          </p>
        </Panel>
      ) : (
        Array.from(periods.entries()).map(([key, { label, rows }]) => (
          <Panel key={key} title={label} hint={`${rows.length} decided`}>
            <div className="overflow-x-auto scroll-shadow-x -mx-4 sm:-mx-5 px-4 sm:px-5">
              <table className="w-full text-[13px] border-collapse min-w-[480px]">
                <thead>
                  <tr>
                    <th className={`${TH} w-0 px-2`}><span className="sr-only">Expand</span></th>
                    {canViewAll && <th className={TH}>Associate</th>}
                    <th className={TH}>Type</th>
                    <th className={TH}>Dates</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Decided</th>
                    {isTL && <th className={`${TH} w-0 px-2`}><span className="sr-only">Actions</span></th>}
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
                        colCount={colCount}
                        typeConfig={
                          typeConfig
                            ? { key: typeConfig.key, label: typeConfig.label, behavior: typeConfig.behavior }
                            : undefined
                        }
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
