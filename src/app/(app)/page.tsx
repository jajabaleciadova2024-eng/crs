// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { requireProfile, isApprover, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, Pill, Card, PageHeader } from "@/components/ui";
import type { LeaveStatus } from "@/lib/database.types";
import { todayInManila, startOfWorkWeek, isWorkday, isTomorrowRevealed, addDays, nextWorkday, weekdayLongLabel } from "@/lib/scheduleDates";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { credentialBlock } from "@/lib/passwordBlockingServer";
import PasswordCountdown from "@/components/PasswordCountdown";
import { expiryState, BLOCK_WITHIN_DAYS } from "@/lib/passwordExpiry";
import { BREAK_SLOT_LABEL, type BreakSlot } from "@/lib/breakTime";
import { holidayDateSet, holidaysInRange } from "@/lib/holidays";
import { toTitleCase, formatFullName } from "@/lib/format";
import ProfilePhotoFrame from "@/components/ProfilePhotoFrame";
import LeaveCalendar from "./leave/calendar/LeaveCalendar";
import { getLeaveCalendarRequests } from "@/lib/leaveCalendarData";
import { buildLeaveDayMap } from "@/lib/leaveCalendar";
import { DEFAULT_LEAVE_TYPE_CONFIGS } from "@/lib/leaveTypes";
import SocialFeed from "@/components/feed/SocialFeed";
import QuickPostButton from "@/components/feed/QuickPostButton";

// One day's posting on the Dashboard station card: a small muted day label,
// the station as the headline, then window and break together underneath.
function StationLine({
  day,
  station,
  empty,
  windowLabel,
  breakLabel,
  coverText,
}: {
  day: string;
  station?: string;
  empty: string;
  windowLabel?: string;
  breakLabel?: string;
  /** One entry per window this member relieves that day. */
  coverText?: string[];
}) {
  const meta = [windowLabel ? `W${windowLabel}` : null, breakLabel ? `Break ${breakLabel}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold leading-tight">{day}</div>
      <div className={`text-[15px] leading-tight mt-0.5 ${station ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>
        {station ?? empty}
      </div>
      {meta && <div className="text-[11.5px] text-[var(--muted)] leading-snug mt-0.5">{meta}</div>}
      {coverText?.map((line) => (
        <div key={line} className="text-[11.5px] text-[var(--warn)] font-medium leading-snug mt-0.5">
          {line}
        </div>
      ))}
    </div>
  );
}

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
  // The next WORKING day, not literally tomorrow — on a Friday the floor
  // cares about Monday, and Saturday has no schedule to show.
  // Fetch TL-managed holidays for the next 2 weeks so nextWorkday skips them.
  const holidayDates = await holidayDateSet(supabase, todayInManila(), addDays(todayInManila(), 14));
  const holidayList = await holidaysInRange(supabase, todayInManila(), addDays(todayInManila(), 14));
  const holidayNameMap = new Map(holidayList.map((h) => [h.date, h.name]));
  const todayHoliday = holidayNameMap.get(todayInManila());
  const tomorrow = nextWorkday(todayInManila(), holidayDates);
  const isLiterallyTomorrow = tomorrow === addDays(todayInManila(), 1);
  // "Tomorrow" only when it really is; otherwise name the day.
  const nextDayLabel = isLiterallyTomorrow ? "Tomorrow" : weekdayLongLabel(tomorrow);
  // Find the schedule_week that contains it (could be this week or next).
  const tomorrowWeekStart = startOfWorkWeek(tomorrow);

  const [{ data: assignments }, { data: recentLeave }, { data: tomorrowWeekRow }] = await Promise.all([
    week
      ? supabase
          .from("assignments")
          .select("*, workstations(name), workstation_windows(label), profiles(first_name, last_name, avatar_url)")
          .eq("schedule_week_id", week.id)
          .eq("assignment_date", displayDate)
      : Promise.resolve({ data: null }),
    approver ? leaveQuery : leaveQuery.eq("associate_id", profile.id),
    // Fetch the week that contains tomorrow so we can look up tomorrow's assignment
    isRotatingRole
      ? supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", tomorrowWeekStart).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Fetch tomorrow's assignment for this user (if the week exists)
  const { data: myTomorrowAssignment } = isRotatingRole && tomorrowWeekRow
    ? await supabase
        .from("assignments")
        .select("workstations(name), workstation_windows(label)")
        .eq("schedule_week_id", tomorrowWeekRow.id)
        .eq("associate_id", profile.id)
        .eq("assignment_date", tomorrow)
        .maybeSingle()
    : { data: null };

  // Seats filled vs. total seats — a station can have several seats (e.g.
  // Collecting Officer has 4 headcount), so this counts by headcount, not
  // by station: assignments.length is already one row per seated person
  // for displayDate, and totalSeats sums each active station's fixed
  // headcount rather than just counting stations.
  const stationsManned = assignments?.length ?? 0;
  const totalStations = (activeWorkstations ?? []).reduce((sum, w) => sum + (w.headcount ?? 0), 0);
  const myCurrentAssignment = assignments?.find((a) => a.associate_id === profile.id);
  const myCurrentStationName = (myCurrentAssignment as any)?.workstations?.name as string | undefined;
  const myTomorrowStationName = (myTomorrowAssignment as any)?.workstations?.name as string | undefined;

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

  // Password countdown — shown to everyone, Team Leader included: their own
  // account expires exactly like anybody else's.
  const credential = await credentialBlock(profile.id);
  const credState = expiryState(credential.lastResetAt);

  // Resets claimed and waiting on the Team Leader. The bell announces one
  // when it arrives, but a bell notification is a moment — this is the
  // standing count, which is what actually gets acted on.
  const { count: pendingResetCount } = profile.role === "team_leader"
    ? await createAdminClient()
        .from("password_resets")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    : { count: 0 };

  const tomorrowRevealed = isTomorrowRevealed();

  // Break slots for both lines of the station card — today's, and the next
  // working day's. The next day usually lives in a DIFFERENT schedule week
  // (any Friday, and every day of a week generated ahead of time), which is
  // why each is looked up against its own week row.
  const [{ data: myBreakToday }, { data: myBreakNextDay }] = await Promise.all([
    isRotatingRole && week
      ? supabase
          .from("break_assignments")
          .select("break_slot")
          .eq("schedule_week_id", week.id)
          .eq("assignment_date", displayDate)
          .eq("associate_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isRotatingRole && tomorrowWeekRow
      ? supabase
          .from("break_assignments")
          .select("break_slot")
          .eq("schedule_week_id", tomorrowWeekRow.id)
          .eq("assignment_date", tomorrow)
          .eq("associate_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // Relief duty: a reliever is WORKING through the slot they cover, so it
  // never shows up as their own break. Without this they'd have no reason to
  // look at /breaks and would simply not know.
  const [{ data: myCoverToday }, { data: myCoverNextDay }] = await Promise.all([
    isRotatingRole && week
      ? supabase
          .from("break_assignments")
          .select("break_slot, workstation_windows(label, workstations(name))")
          .eq("schedule_week_id", week.id)
          .eq("assignment_date", displayDate)
          .eq("reliever_associate_id", profile.id)
      : Promise.resolve({ data: [] }),
    isRotatingRole && tomorrowWeekRow
      ? supabase
          .from("break_assignments")
          .select("break_slot, workstation_windows(label, workstations(name))")
          .eq("schedule_week_id", tomorrowWeekRow.id)
          .eq("assignment_date", tomorrow)
          .eq("reliever_associate_id", profile.id)
      : Promise.resolve({ data: [] }),
  ]);
  // One line per window covered, ordered by slot so it reads chronologically.
  const coverTexts = (rows: any): string[] =>
    ((rows ?? []) as any[])
      .filter((r) => r?.workstation_windows?.workstations?.name)
      .sort((a, b) => String(a.break_slot).localeCompare(String(b.break_slot)))
      .map((r) => {
        const station = r.workstation_windows.workstations.name;
        const label = r.workstation_windows.label;
        return `Cover ${station}${label ? ` W${label}` : ""} ${BREAK_SLOT_LABEL[r.break_slot as BreakSlot]}`;
      });
  const myCoverTodayText = coverTexts(myCoverToday);
  const myCoverNextDayText = coverTexts(myCoverNextDay);

  const myBreakSlot = (myBreakToday as any)?.break_slot as BreakSlot | undefined;
  const myNextBreakSlot = (myBreakNextDay as any)?.break_slot as BreakSlot | undefined;
  const myWindowLabel = (myCurrentAssignment as any)?.workstation_windows?.label as string | undefined;
  const myNextWindowLabel = (myTomorrowAssignment as any)?.workstation_windows?.label as string | undefined;

  // Org-wide leave calendar — visible to every role (see leave/calendar/page.tsx).
  const [leaveCalendarRequests, { data: calendarOrgSettings }] = await Promise.all([
    getLeaveCalendarRequests(),
    supabase.from("org_settings").select("leave_type_configs").limit(1).maybeSingle(),
  ]);
  const leaveTypeConfigs = calendarOrgSettings?.leave_type_configs ?? DEFAULT_LEAVE_TYPE_CONFIGS;
  const leaveDayMap = buildLeaveDayMap(leaveCalendarRequests);

  return (
    <>
      <PageHeader>
        {/* pr-12 keeps the row clear of the fixed notification bell in the
            top-right corner (see (app)/layout.tsx) on smaller viewports. */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0 pr-12 md:pr-16">
          <ProfilePhotoFrame
            firstName={profile.first_name}
            lastName={profile.last_name}
            avatarUrl={profile.avatar_url}
          />
          <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="min-w-0 shrink-0">
              <h1 className="font-serif text-lg sm:text-2xl md:text-[28px] m-0 tracking-tight truncate">
                Good day, {toTitleCase(profile.first_name)}
              </h1>
              {/* Identity sits with the face it belongs to. As a stat card it
                  read as a metric, and it is the one card whose value can
                  never change while you are looking at it. */}
              <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--accent-strong)]">{ROLE_LABEL[profile.role]}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{profile.psid}</span>
              </div>
            </div>
            <QuickPostButton mentionable={mentionableProfiles ?? []} />
          </div>
        </div>
      </PageHeader>

      <div
        className={`grid grid-cols-1 min-[400px]:grid-cols-2 ${
          // Six cards for a Team Leader, four or five for everyone else.
          // Three columns divides the six evenly instead of leaving one
          // stranded on a second row, which is what five did.
          profile.role === "team_leader" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
        } gap-3 mb-4`}
      >
        {/* Password countdown. Deliberately first and always present — rule 1
            on the floor is that nobody's password lapses, and a number you
            have to go looking for is a number nobody looks at. */}
        <a
          href="/account"
          className="border rounded-xl bg-[var(--paper-raised)] px-4 py-4 hover:border-[var(--accent)] transition-colors block"
          style={{
            borderColor:
              credState === "expired" || credState === "blocking" || credState === "unset"
                ? "var(--bad)"
                : credState === "warning"
                  ? "var(--warn)"
                  : "var(--line)",
          }}
        >
          {/* Same three-part rhythm as Card: label, value, sub. The units are
              inline on the value now — the old DD:HH:MM:SS legend was a
              fourth line no other card had, which is what threw the row's
              alignment out. */}
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">
            Password expires in
          </div>
          {/* Same box height as Card's serif value line, so the row's numbers
              sit on one optical line — a mono inline span makes a shorter
              line box than the serif numerals and floated 6px low without
              this. */}
          <div className="flex items-center h-[26px] sm:h-[28px]">
            <PasswordCountdown lastResetAt={credential.lastResetAt} variant="compact" />
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1.5 leading-snug">
            {credState === "unset"
              ? profile.role === "team_leader"
                ? "No baseline yet — set your own on Account Security"
                : "No baseline set — ask your TL"
              : credState === "expired"
                ? "Expired — reset it now"
                : credState === "blocking"
                  ? profile.role === "team_leader"
                    ? `Expiring within ${BLOCK_WITHIN_DAYS} days — reset it now`
                    : "Schedule locked until reset"
                  : credState === "warning"
                    ? "Reset it soon"
                    : "In good standing"}
          </div>
        </a>
        <Card label="Seats filled" value={`${stationsManned} / ${totalStations}`} sub={week ? "Today's coverage" : "No schedule published yet"} />
        {isRotatingRole && (
          <a
            href="/schedule"
            className="border border-[var(--line)] rounded-xl bg-[var(--paper-raised)] px-4 py-4 hover:border-[var(--accent)] transition-colors block"
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">Station</div>

            {/* Day is quiet metadata; the station name is the content. Window
                and break share one muted line so a posting is three tight
                lines instead of four competing ones. */}
            {todayHoliday ? (
              <StationLine day="Today" empty={`🎉 ${todayHoliday}`} />
            ) : (
              <StationLine
                day="Today"
                station={week ? myCurrentStationName : undefined}
                empty={week ? "Not assigned" : "No schedule yet"}
                windowLabel={myWindowLabel}
                breakLabel={myBreakSlot ? BREAK_SLOT_LABEL[myBreakSlot] : undefined}
                coverText={myCoverTodayText}
              />
            )}

            <div className="border-t border-[var(--line)]/60 my-2.5" />

            {blockingTaskCount > 0 ? (
              <StationLine day={nextDayLabel} empty="Complete tasks to view" />
            ) : !tomorrowRevealed ? (
              <StationLine day={nextDayLabel} empty="Revealed at 12 PM" />
            ) : (
              <StationLine
                day={nextDayLabel}
                station={myTomorrowStationName}
                empty="Not assigned"
                windowLabel={myNextWindowLabel}
                breakLabel={myNextBreakSlot ? BREAK_SLOT_LABEL[myNextBreakSlot] : undefined}
                coverText={myCoverNextDayText}
              />
            )}
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
        {profile.role === "team_leader" && (
          <Card
            label="Password resets"
            href="/account"
            value={String(pendingResetCount ?? 0)}
            sub={(pendingResetCount ?? 0) > 0 ? "Claimed — confirm them" : "Nothing to confirm"}
            tone={(pendingResetCount ?? 0) > 0 ? "warn" : undefined}
          />
        )}
        {profile.role === "team_leader" && <Card label="Immune this cycle" value={String(immuneCount ?? 0)} sub="Excluded from shuffle" />}
        {profile.role === "team_leader" && (
          <Card
            label="Access requests"
            value={String(pendingAccessCount ?? 0)}
            sub="Awaiting review"
            tone={(pendingAccessCount ?? 0) > 0 ? "warn" : undefined}
          />
        )}
      </div>

      <Panel
        title="Leave Calendar"
        hint="Org-wide"
        action={
          <Link href="/leave/calendar" className="text-xs font-bold text-[var(--accent-strong)]">
            Open full calendar →
          </Link>
        }
      >
        <LeaveCalendar dayMap={leaveDayMap} leaveTypeConfigs={leaveTypeConfigs} today={todayInManila()} />
      </Panel>

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
