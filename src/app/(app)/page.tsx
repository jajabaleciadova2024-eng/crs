// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, isApprover, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill, Card, PageHeader } from "@/components/ui";
import type { LeaveStatus } from "@/lib/database.types";
import { todayInManila, startOfWorkWeek } from "@/lib/scheduleDates";
import { toTitleCase, formatFullName } from "@/lib/format";
import ProfilePhotoFrame from "@/components/ProfilePhotoFrame";

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const approver = isApprover(profile.role);

  const weekStart = startOfWorkWeek(todayInManila());

  // Independent queries run in parallel instead of stacking sequentially —
  // this was a big chunk of page-load delay (6+ round-trips one after
  // another). Assignments/recent-leave depend on the first batch's results
  // (week id, role), so they go in a second parallel batch.
  const [{ data: week }, { data: activeWorkstations }, { count: pendingCount }, { count: immuneCount }, { count: pendingAccessCount }] =
    await Promise.all([
      supabase.from("schedule_weeks").select("*").eq("week_start_date", weekStart).maybeSingle(),
      supabase.from("workstations").select("id").eq("is_active", true),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // Immune is a Team-Leader-only scheduling concern — not shown to OIC/associates.
      profile.role === "team_leader"
        ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_immune", true).eq("is_active", true)
        : Promise.resolve({ count: null as number | null }),
      profile.role === "team_leader"
        ? supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : Promise.resolve({ count: null as number | null }),
    ]);

  const leaveQuery = supabase
    .from("leave_requests")
    // Must disambiguate: leave_requests has two FKs to profiles
    // (associate_id, reviewed_by) — see /leave/page.tsx for the full note.
    .select("*, profiles!leave_requests_associate_id_fkey(first_name, last_name, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(5);

  const [{ data: assignments }, { data: recentLeave }] = await Promise.all([
    week
      ? supabase.from("assignments").select("*, workstations(name), profiles(first_name, last_name, avatar_url)").eq("schedule_week_id", week.id)
      : Promise.resolve({ data: null }),
    approver ? leaveQuery : leaveQuery.eq("associate_id", profile.id),
  ]);

  const stationsManned = assignments?.length ?? 0;
  const totalStations = activeWorkstations?.length ?? 0;

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-5">
          <ProfilePhotoFrame
            firstName={profile.first_name}
            lastName={profile.last_name}
            avatarUrl={profile.avatar_url}
          />
          <div>
            <h1 className="font-serif text-2xl md:text-[28px] m-0 mb-1 tracking-tight">
              Good day, {toTitleCase(profile.first_name)}
            </h1>
            <p className="text-sm text-[var(--muted)] m-0">
              Week of {weekStart} · {totalStations} stations · {ROLE_LABEL[profile.role]}
            </p>
          </div>
        </div>
      </PageHeader>

      <div className={`grid grid-cols-2 ${profile.role === "team_leader" ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-3"} gap-3 mb-8`}>
        <Card label="Stations manned" value={`${stationsManned} / ${totalStations}`} sub={week ? "This week's coverage" : "No schedule published yet"} />
        <Card label="Pending approvals" value={String(pendingCount ?? 0)} sub="Awaiting review" tone={(pendingCount ?? 0) > 0 ? "warn" : undefined} />
        {profile.role === "team_leader" && <Card label="Immune this cycle" value={String(immuneCount ?? 0)} sub="Excluded from shuffle" />}
        {profile.role === "team_leader" && (
          <Card
            label="Access requests"
            value={String(pendingAccessCount ?? 0)}
            sub="Awaiting review"
            tone={(pendingAccessCount ?? 0) > 0 ? "warn" : undefined}
          />
        )}
        <Card label="Your role" value={ROLE_LABEL[profile.role]} sub={profile.psid} />
      </div>

      <Panel title="This week's assignments" hint={week ? week.week_start_date : "Not yet generated"}>
        {assignments && assignments.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assignments.map((a) => {
              const isOwn = a.associate_id === profile.id;
              return (
                <div
                  key={a.id}
                  className={`border rounded-lg p-3.5 transition-colors ${
                    isOwn ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--accent)]"
                  }`}
                  style={{ boxShadow: isOwn ? "var(--shadow-sm)" : undefined }}
                >
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${isOwn ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}>
                    {(a as any).workstations?.name}
                    {isOwn ? " — your station" : ""}
                  </div>
                  <div className="font-serif text-base mt-1.5">
                    {formatFullName((a as any).profiles?.first_name, (a as any).profiles?.last_name)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] py-3">
            No schedule has been generated for this week yet.
          </p>
        )}
      </Panel>

      <Panel title={approver ? "Recent leave activity" : "Your recent leave activity"} hint="Last 5 requests">
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {approver && <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-3 border-b border-[var(--line)]">Associate</th>}
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-3 border-b border-[var(--line)]">Type</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-3 border-b border-[var(--line)]">Dates</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-3 border-b border-[var(--line)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLeave && recentLeave.length > 0 ? (
                recentLeave.map((r) => (
                  <tr key={r.id}>
                    {approver && (
                      <td className="py-3 border-b border-[var(--line)]">
                        {formatFullName((r as any).profiles?.first_name, (r as any).profiles?.last_name)}
                      </td>
                    )}
                    <td className="py-3 border-b border-[var(--line)] capitalize">{r.leave_type}</td>
                    <td className="py-3 border-b border-[var(--line)]">
                      {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                    </td>
                    <td className="py-3 border-b border-[var(--line)]">
                      <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={approver ? 4 : 3} className="py-6 text-[var(--muted)] text-center">
                    No leave activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
