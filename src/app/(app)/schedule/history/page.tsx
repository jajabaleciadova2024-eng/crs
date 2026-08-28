// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, isApprover } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, Pill, PageHeader } from "@/components/ui";
import { formatLeaveDate } from "@/lib/leaveFormat";
import HistoryFilters from "./HistoryFilters";

const ACTION_TONE: Record<string, "good" | "warn" | "bad" | "accent"> = {
  assigned: "good",
  moved: "warn",
  reassigned: "warn",
  removed: "bad",
};

const ACTION_LABEL: Record<string, string> = {
  assigned: "Assigned",
  moved: "Moved station",
  reassigned: "Person swapped",
  removed: "Removed",
};

const PAGE_SIZE = 100;

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export default async function ScheduleHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; member?: string; station?: string }>;
}) {
  const profile = await requireProfile();
  // Incident tracing is a leadership function — matches the RLS policy on
  // assignment_history (team_leader + oic).
  if (!isApprover(profile.role)) redirect("/schedule");

  const params = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("assignment_history")
    .select("*")
    .order("assignment_date", { ascending: false })
    .order("changed_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (params.from) query = query.gte("assignment_date", params.from);
  if (params.to) query = query.lte("assignment_date", params.to);
  if (params.member) query = query.eq("associate_id", params.member);
  if (params.station) query = query.eq("workstation_id", params.station);

  const [{ data: rows }, { data: members }, { data: stations }] = await Promise.all([
    query,
    admin.from("profiles").select("id, first_name, last_name").order("first_name"),
    admin.from("workstations").select("id, name").order("name"),
  ]);

  const entries = rows ?? [];
  const filtered = Boolean(params.from || params.to || params.member || params.station);

  return (
    <>
      <PageHeader
        title="Assignment History"
        subtitle="Every station assignment change, kept permanently for incident tracing — survives schedule regeneration and clearing"
        action={
          <Link href="/schedule" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Weekly Schedule
          </Link>
        }
      />

      <Panel title="Filters">
        <HistoryFilters members={members ?? []} stations={stations ?? []} />
      </Panel>

      <Panel
        title="Changes"
        hint={
          entries.length >= PAGE_SIZE
            ? `Showing latest ${PAGE_SIZE} — narrow the filters to see more`
            : `${entries.length} record${entries.length === 1 ? "" : "s"}`
        }
        footnote="Written automatically by the database whenever an assignment is created, moved, swapped, or deleted. This log cannot be edited from the app."
      >
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {["Work date", "Change", "Station", "Member", "Was", "By", "Recorded"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--muted)]">
                    {filtered ? "No assignment changes match those filters." : "No assignment changes recorded yet."}
                  </td>
                </tr>
              ) : (
                entries.map((r: any) => {
                  const movedFrom =
                    r.action === "moved" && r.previous_workstation_name
                      ? `${r.previous_workstation_name}`
                      : r.action === "reassigned" && r.previous_associate_name
                        ? `${r.previous_associate_name}`
                        : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap font-semibold">
                        {formatLeaveDate(r.assignment_date)}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                        <Pill tone={ACTION_TONE[r.action] ?? "accent"}>{ACTION_LABEL[r.action] ?? r.action}</Pill>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                        {r.workstation_name ?? <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                        {r.associate_name || <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
                        {movedFrom ?? "—"}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
                        {r.changed_by_name || <span className="italic">system</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap text-[11.5px] text-[var(--muted)]">
                        {formatTimestamp(r.changed_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
