// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, isApprover, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, Pill, Card, PageHeader } from "@/components/ui";
import type { LeaveStatus } from "@/lib/database.types";
import { todayInManila, startOfWorkWeek, isWorkday, isTomorrowRevealed } from "@/lib/scheduleDates";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { toTitleCase, formatFullName } from "@/lib/format";
import ProfilePhotoFrame from "@/components/ProfilePhotoFrame";
import SocialFeed from "@/components/feed/SocialFeed";
import QuickPostButton from "@/components/feed/QuickPostButton";

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
  // Stations now get a different person per day (see
  // 0022_daily_assignments.sql) — the Dashboard's "today" cards need an
  // actual date, not just the week. Falls back to Monday on a weekend,
  // since there's no "today" assignment then.
  const displayDate = isWorkday(todayInManila()) ? todayInManila() : weekStart;

  // Independent queries run in parallel instead of stacking sequentially —
  // this was a big chunk of page-load delay (6+ round-trips one after
  // another). Assignments/recent-leave depend on the first batch's results
  // (week id, role), so they go in a second parallel batch.
  const [{ data: week }, { data: latestWeekRow }, { data: activeWorkstations }, { count: pendingCount }, { count: immuneCount }, { count: pendingAccessCount }, { data: mentionableProfiles }] =
    await Promise.all([
      supabase.from("schedule_weeks").select("*").eq("week_start_date", weekStart).maybeSingle(),
      // Dashboard only ever shows the CURRENT week's assignments above —
      // but generating always produces the UPCOMING week's schedule (see
      // /api/schedule/generate), which never shows here until that week
      // arrives. Fetching the latest week on record separately lets us
      // surface a "View next week's schedule" link when one's already
      // been generated, instead of it just being invisible until then.
      supabase.from("schedule_weeks").select("id, week_start_date").order("week_start_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("workstations").select("id, headcount").eq("is_active", true),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // Immune is a Team-Leader-only scheduling concern — not shown to OIC/associates.
      profile.role === "team_leader"
        ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_immune", true).eq("is_active", true)
        : Promise.resolve({ count: null as number | null }),
      profile.role === "team_leader"
        ? supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : Promise.resolve({ count: null as number | null }),
      // @mention autocomplete source for the Team Feed — first names only,
      // every active member (all roles) is mentionable. MUST go through
      // the admin client (bypasses RLS): the request-scoped client's
      // "profiles_select_own_or_leadership" policy hides every other
      // member's row from non-leadership viewers, so previously an
      // associate's mentions dropdown only ever contained themselves.
      createAdminClient().from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name"),
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
    // Scoped to displayDate (today, or Monday on a weekend) — a station
    // can have a different person each day now, so "this week's
    // assignments" is no longer a single static list.
    week
      ? supabase
          .from("assignments")
          .select("*, workstations(name), profiles(first_name, last_name, avatar_url)")
          .eq("schedule_week_id", week.id)
          .eq("assignment_date", displayDate)
      : Promise.resolve({ data: null }),
    approver ? leaveQuery : leaveQuery.eq("associate_id", profile.id),
    // Own station for the ALREADY-generated next week, if there is one —
    // Dashboard otherwise only ever shows the current week (see the
    // "View next week" link below), so this is the only place a rotating
    // member would see where they land next week without navigating away.
    // Monday is used as the representative day for this single-value
    // preview card — the full day-by-day breakdown is on /schedule.
    isRotatingRole && nextWeekStart
      ? supabase
          .from("assignments")
          .select("workstations(name)")
          .eq("schedule_week_id", latestWeekRow!.id)
          .eq("associate_id", profile.id)
          .eq("assignment_date", nextWeekStart)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Seats filled vs. total seats — a station can have several seats (e.g.
  // Collecting Officer has 4 headcount), so this counts by headcount, not
  // by station: assignments.length is already one row per seated person
  // for displayDate, and totalSeats sums each active station's fixed
  // headcount rather than just counting stations.
  const stationsManned = assignments?.length ?? 0;
  const totalStations = (activeWorkstations ?? []).reduce((sum, w) => sum + (w.headcount ?? 0), 0);
  const myCurrentAssignment = assignments?.find((a) => a.associate_id === profile.id);
  const myCurrentStationName = (myCurrentAssignment as any)?.workstations?.name as string | undefined;
  const myNextStationName = (myNextAssignment as any)?.workstations?.name as string | undefined;

  // --- Task blocking for associates/OIC ---
  let blockingTaskCount = 0;
  if (isRotatingRole) {
    const adminClient = createAdminClient();
    const [{ data: dashTasks }, { data: dashCompletions }] = await Promise.all([
      adminClient
        .from("member_tasks")
        .select("id, deadline, blocker_days_before, assign_to")
        .or(`assign_to.eq.all,assign_to.eq.${profile.id}`),
      adminClient
        .from("member_task_completions")
        .select("task_id, status")
        .eq("profile_id", profile.id),
    ]);
    const dashApprovedIds = new Set(
      (dashCompletions ?? [])
        .filter((c: { status: string }) => c.status === "approved")
        .map((c: { task_id: string }) => c.task_id),
    );
    blockingTaskCount = (dashTasks ?? []).filter(
      (t: { id: string; deadline: string | null; blocker_days_before: number }) =>
        !dashApprovedIds.has(t.id) && isTaskBlockingToday(t),
    ).length;
  }

  const tomorrowRevealed = isTomorrowRevealed();

  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <ProfilePhotoFrame
              firstName={profile.first_name}
              lastName={profile.last_name}
              avatarUrl={profile.avatar_url}
            />
            <div className="min-w-0">
              <h1 className="font-serif text-lg sm:text-2xl md:text-[28px] m-0 tracking-tight truncate">
                Good day, {toTitleCase(profile.first_name)}
              </h1>
            </div>
          </div>
          <QuickPostButton />
        </div>
      </PageHeader>

      <div
        className={`grid grid-cols-1 min-[400px]:grid-cols-2 ${
          profile.role === "team_leader" ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4"
        } gap-3 mb-8`}
      >
        <Card label="Seats filled" value={`${stationsManned} / ${totalStations}`} sub={week ? "Today's coverage" : "No schedule published yet"} />
        {isRotatingRole && (
          <a
            href="/schedule"
            className="border border-[var(--line)] rounded-xl bg-[var(--paper-raised)] p-3.5 hover:border-[var(--accent)] transition-colors block"
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Station</div>
            <div className="text-[13px] font-semibold text-[var(--ink)]">
              Today: {week ? (myCurrentStationName ?? "Not assigned") : "No schedule yet"}
            </div>
            <div className="border-t border-[var(--line)] my-1.5" />
            <div className="text-[13px] font-semibold text-[var(--ink)]">
              {blockingTaskCount > 0
                ? "🔒 Complete tasks to view"
                : !tomorrowRevealed && nextWeekStart
                  ? "Next week: Revealed at 5 PM"
                  : `Next Week (Mon): ${nextWeekStart ? (myNextStationName ?? "Not assigned") : "Not yet generated"}`}
            </div>
          </a>
        )}
        {isRotatingRole && blockingTaskCount > 0 && (
          <Card
            label="Pending Tasks"
            href="/tasks"
            value={String(blockingTaskCount)}
            sub="Complete to unlock schedule"
            tone="warn"
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

      <Panel title="Team Feed" hint="What's happening">
        <SocialFeed userId={profile.id} currentUserRole={profile.role} mentionable={mentionableProfiles ?? []} initialLimit={10} viewAllHref="/feed" />
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
