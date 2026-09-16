import Link from "next/link";
import { requireProfile, isApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { getPayPeriod } from "@/lib/payPeriod";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";
import HistoryBrowser from "./HistoryBrowser";
import type { HistoryRow } from "./LeaveHistoryRow";

export default async function LeaveHistoryPage() {
  const profile = await requireProfile();
  const canViewAll = isApprover(profile.role);
  const isTL = profile.role === "team_leader";

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

  const periods = new Map<string, { key: string; label: string; rows: HistoryRow[] }>();
  for (const r of decided ?? []) {
    const period = getPayPeriod(r.start_date);
    if (!periods.has(period.key)) {
      periods.set(period.key, { key: period.key, label: period.label, rows: [] });
    }
    periods.get(period.key)!.rows.push(r as unknown as HistoryRow);
  }

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

      <HistoryBrowser
        periods={Array.from(periods.values())}
        leaveTypeConfigs={leaveTypeConfigs}
        canViewAll={canViewAll}
        isTL={isTL}
      />
    </>
  );
}
