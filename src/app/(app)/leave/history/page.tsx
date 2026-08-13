import Link from "next/link";
import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Avatar } from "@/components/ui";
import { getPayPeriod } from "@/lib/payPeriod";
import { DEFAULT_LEAVE_TYPE_CONFIGS, type LeaveTypeConfig } from "@/lib/leaveTypes";

export default async function LeaveHistoryPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader"]);

  const supabase = await createClient();
  const [{ data: orgSettings }, { data: approved }] = await Promise.all([
    supabase.from("org_settings").select("leave_type_configs").limit(1).maybeSingle(),
    supabase
      .from("leave_requests")
      // Must disambiguate: leave_requests has two FKs to profiles
      // (associate_id, reviewed_by) — see /leave/page.tsx for the full note.
      .select("id, leave_type, start_date, end_date, reviewed_at, profiles!leave_requests_associate_id_fkey(first_name, last_name)")
      .eq("status", "approved")
      .order("start_date", { ascending: false }),
  ]);
  const leaveTypeConfigs: LeaveTypeConfig[] = orgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;

  const periods = new Map<string, { label: string; rows: NonNullable<typeof approved> }>();
  for (const r of approved ?? []) {
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
              Approved leave, grouped by semi-monthly period (1st–15th, 16th–end of month) — Team Leader only
            </p>
          </div>
          <Link href="/leave" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Leave Requests
          </Link>
        </div>
      </header>

      {periods.size === 0 ? (
        <Panel title="No approved leave yet">
          <p className="text-sm text-[var(--muted)] m-0">Once requests are approved, they&apos;ll show up here grouped by period.</p>
        </Panel>
      ) : (
        Array.from(periods.entries()).map(([key, { label, rows }]) => (
          <Panel key={key} title={label} hint={`${rows.length} approved`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Approved on</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = (r as any).profiles;
                    const typeLabel = leaveTypeConfigs.find((c) => c.key === r.leave_type)?.label ?? r.leave_type;
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          <span className="flex items-center">
                            <Avatar firstName={p?.first_name ?? ""} lastName={p?.last_name ?? ""} />
                            {p?.first_name} {p?.last_name}
                          </span>
                        </td>
                        <td className="py-2.5 border-b border-[var(--line)] capitalize">{typeLabel}</td>
                        <td className="py-2.5 border-b border-[var(--line)]">
                          {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
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
