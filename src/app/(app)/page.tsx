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
  const [{ data: week }, { data: latestWeekRow }, { data: activeWorkstations }, { count: pendingCount }, { count: immuneCount }, { count: pendingAccessCount }] =
    await Promise.all([
      supabase.from("schedule_weeks").select("*").eq("week_start_date", weekStart).maybeSingle(),
      // Dashboard only ever shows the CURRENT week's assignments above —
      // but generating always produces the UPCOMING week's schedule (see
      // /api/schedule/generate), which never shows here until that week
      // arrives. Fetching the latest week on record separately lets us
      // surface a "View next week's schedule" link when one's already
      // been generated, instead of it just being invisible until then.
      supabase.from("schedule_weeks").select("id, week_start_date").order("week_start_date", { ascending: false }).limit(1).maybeSingle(),
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

  // Only rotating roles (associate/OIC) ever get seated at a station — the
  // Team Leader never does, so their own-station card never applies.
  const isRotatingRole = profile.role !== "team_leader";
  const nextWeekStart =
    latestWeekRow && latestWeekRow.week_start_date > weekStart ? latestWeekRow.week_start_date : null;

  const [{ data: assignments }, { data: recentLeave }, { data: myNextAssignment }] = await Promise.all([
    week
      ? supabase.from("assignments").select("*, workstations(name), profiles(first_name, last_name, avatar_url)").eq("schedule_week_id", week.id)
      : Promise.resolve({ data: null }),
    approver ? leaveQuery : leaveQuery.eq("associate_id", profile.id),
    // Own station for the ALREADY-generated next week, if there is one —
    // Dashboard otherwise only ever shows the current week (see the
    // "View next week" link below), so this is the only place a rotating
    // member would see where they land next week without navigating away.
    isRotatingRole && nextWeekStart
      ? supabase
          .from("assignments")
          .select("workstations(name)")
          .eq("schedule_week_id", latestWeekRow!.id)
          .eq("associate_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Distinct stations with at least one person seated — NOT a raw count of
  // assignment rows, since a station can have more than one seat filled
  // (e.g. Collecting Officer has 4). Counting rows would show something
  // like "15 / 6", which reads as more stations manned than exist.
  const stationsManned = new Set((assignments ?? []).map((a) => a.workstation_id)).size;
  const totalStations = activeWorkstations?.length ?? 0;
  const myCurrentAssignment = assignments?.find((a) => a.associate_id === profile.id);
  const myCurrentStationName = (myCurrentAssignment as any)?.workstations?.name as string | undefined;
  const myNextStationName = (myNextAssignment as any)?.workstations?.name as string | undefined;

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
            <h1 className="font-serif text-2xl md:text-[28px] m-0 tracking-tight">
              Good day, {toTitleCase(profile.first_name)}
            </h1>
          </div>
        </div>
      </PageHeader>

      <div
        className={`grid grid-cols-2 ${
          profile.role === "team_leader" ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"
        } gap-3 mb-8`}
      >
        <Card label="Stations manned" value={`${stationsManned} / ${totalStations}`} sub={week ? "This week's coverage" : "No schedule published yet"} />
        {isRotatingRole && (
          <Card
            label="Next Week's Station"
            href="/schedule"
            value={nextWeekStart ? (myNextStationName ?? "Not assigned") : "Not yet generated"}
            sub={`This week: ${week ? (myCurrentStationName ?? "not assigned") : "no schedule yet"}`}
          />
        )}
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
