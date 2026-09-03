// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Panel, Pill, Card, PageHeader, Button } from "@/components/ui";
import TaskBlockBanner from "./TaskBlockBanner";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { credentialBlock } from "@/lib/passwordBlockingServer";
import ScheduleCell from "./ScheduleCell";
import GenerateButton from "./GenerateButton";
import ClearScheduleButton from "./ClearScheduleButton";
import RotationSettingsPanel from "./RotationSettingsPanel";
import WeekTabs from "./WeekTabs";
import { todayInManila, startOfWorkWeek, endOfWorkWeek, formatWeekRange, addDays, workDatesForWeek, weekdayShortLabel, isTomorrowRevealed, nextWorkday } from "@/lib/scheduleDates";
import { holidaysInRange, holidayDateSet } from "@/lib/holidays";
import { formatFullName } from "@/lib/format";
import { compareStationNames } from "@/lib/stationOrder";

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Renders one week's assignment table (current or next) — extracted so the
// two simultaneous panels below don't duplicate the same fetch/sort/render
// logic. `week` is null when nothing's been generated yet for that slot.
async function WeekPanel({
  supabase,
  week,
  weekStart,
  canManage,
  associates,
  workstationHeadcounts,
  blockedDates,
  viewerId,
  allStations,
}: {
  supabase: SupabaseClient;
  week: { id: string; week_start_date: string } | null;
  weekStart: string;
  canManage: boolean;
  associates: { id: string; first_name: string; last_name: string }[];
  workstationHeadcounts?: Record<string, number>;
  // Dates that should show a placeholder lock instead of real data
  blockedDates?: Set<string>;
  // Non-managers only ever see their OWN assignments — RLS hides everyone
  // else's profile row, so those seats would otherwise render as blank
  // nameless cards. Filtering to this id keeps the grid clean.
  viewerId?: string;
  // Every active station, in standing order. Non-managers render ALL of
  // them as rows: if rows came only from the member's own assignments, a
  // row's mere presence would reveal the station they're at on a day that
  // is still locked (a lone otherwise-empty row = that's Friday's station).
  allStations?: { id: string; name: string }[];
}) {
  const weekEnd = endOfWorkWeek(weekStart);
  const allWorkDates = workDatesForWeek(weekStart);
  // Always render all 5 day columns — blocked dates get placeholder cells
  const workDates = allWorkDates;

  const holidays = await holidaysInRange(supabase, weekStart, weekEnd);
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));

  const { data: rawAssignments } = week
    ? await supabase
        .from("assignments")
        .select(`*, workstations(name), workstation_windows(label), profiles(first_name, last_name, avatar_url${canManage ? ", is_immune" : ""})`)
        .eq("schedule_week_id", week.id)
    : { data: [] };

  // Associates/OIC see only their own seat — everyone else's row comes back
  // with a null joined profile under RLS, which rendered as an empty
  // placeholder card in every seat they aren't in.
  const visibleAssignments = !canManage && viewerId
    ? (rawAssignments ?? []).filter((a: any) => a.associate_id === viewerId)
    : (rawAssignments ?? []);

  const assignments = [...visibleAssignments].sort((a: any, b: any) =>
    compareStationNames(a.workstations?.name ?? "", b.workstations?.name ?? ""),
  );

  // Managers: rows come from what's actually assigned. Everyone else: the
  // full station list, so an empty row leaks nothing about locked days.
  let stationOrder: { id: string; name: string }[] = [];
  if (!canManage && allStations && allStations.length > 0) {
    stationOrder = [...allStations].sort((a, b) => compareStationNames(a.name, b.name));
  } else {
    const seenStations = new Set<string>();
    for (const a of assignments ?? []) {
      if (seenStations.has(a.workstation_id)) continue;
      seenStations.add(a.workstation_id);
      stationOrder.push({ id: a.workstation_id, name: a.workstations?.name ?? "" });
    }
  }

  const cellAssignments = new Map<string, any[]>();
  for (const a of assignments ?? []) {
    const key = `${a.workstation_id}::${a.assignment_date}`;
    const list = cellAssignments.get(key) ?? [];
    list.push(a);
    cellAssignments.set(key, list);
  }

  const assignedIds = [...new Set((assignments ?? []).map((a: any) => a.associate_id))];
  const { data: leaveOnRecord } =
    assignedIds.length > 0
      ? await supabase
          .from("leave_requests")
          .select("associate_id, start_date, end_date, leave_request_ranges(start_date, end_date)")
          .eq("status", "approved")
          .in("associate_id", assignedIds)
      : { data: [] };

  const leaveRangesByAssociate = new Map<string, { start_date: string; end_date: string }[]>();
  for (const lr of leaveOnRecord ?? []) {
    const ranges = [{ start_date: lr.start_date, end_date: lr.end_date }, ...(lr.leave_request_ranges ?? [])];
    leaveRangesByAssociate.set(lr.associate_id, [...(leaveRangesByAssociate.get(lr.associate_id) ?? []), ...ranges]);
  }
  function isOnLeave(associateId: string, date: string): boolean {
    return (leaveRangesByAssociate.get(associateId) ?? []).some((r) => rangesOverlap(r.start_date, r.end_date, date, date));
  }

  const stationByAssociatePerDate = new Map<string, Record<string, string>>();
  for (const date of workDates) {
    const map: Record<string, string> = {};
    for (const a of assignments ?? []) {
      if (a.assignment_date === date) map[a.associate_id] = a.workstations?.name ?? "";
    }
    stationByAssociatePerDate.set(date, map);
  }

  return (
    <Panel
      title={`Week of ${formatWeekRange(weekStart)}`}
      action={canManage && week ? <ClearScheduleButton scheduleWeekId={week.id} weekStart={weekStart} /> : undefined}
      footnote={
        canManage
          ? "Immune members must be manually placed at a station (and which day(s)) in the Generate modal before generating — everyone else fills in from the headcount/tenure quotas, freshly shuffled each day. Drag a card onto another station (same day) to move them, or onto another person to swap — or use the ↻ icon. A teal dot next to a name means Immune; a red dot means On leave that day."
          : "A red dot next to a name means they're on approved leave that day."
      }
    >
      <div className="overflow-x-auto scroll-shadow-x">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-[var(--paper-raised)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] min-w-[96px] sm:min-w-[120px]">
                Station
              </th>
              {workDates.map((date) => (
                <th
                  key={date}
                  className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-l border-[var(--line)] align-bottom min-w-[122px] sm:min-w-[150px]"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[var(--ink)]">{weekdayShortLabel(date)}</span>
                    <span className="normal-case font-normal text-[10.5px] text-[var(--muted)]">{date.slice(5)}</span>
                  </div>
                  {holidayByDate.has(date) && (
                    <Pill tone="warn">{holidayByDate.get(date)}</Pill>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stationOrder.length > 0 ? (
              stationOrder.map((station, i) => (
                <tr key={station.id} className={i % 2 === 1 ? "bg-[var(--paper)]/60" : undefined}>
                  <td
                    className={`sticky left-0 z-[1] px-2 sm:px-3 py-2.5 border-b border-[var(--line)] font-semibold text-[12.5px] sm:text-[13px] align-top whitespace-nowrap ${
                      i % 2 === 1 ? "bg-[var(--paper)]/60" : "bg-[var(--paper-raised)]"
                    }`}
                  >
                    {station.name}
                  </td>
                  {workDates.map((date) => {
                    const isBlocked = blockedDates?.has(date);
                    if (isBlocked) {
                      return (
                        <td key={date} className="px-2 sm:px-3 py-2 border-b border-l border-[var(--line)] align-top">
                          <div className="flex items-center justify-center py-3 text-[var(--muted)] text-[11px] text-center">
                            <span>🔒</span>
                          </div>
                        </td>
                      );
                    }
                    const cell = cellAssignments.get(`${station.id}::${date}`) ?? [];
                    // Associate view: a day they're not at this station is
                    // simply blank — no seat placeholders, no empty cards.
                    if (!canManage && cell.length === 0) {
                      return (
                        <td key={date} className="px-2 sm:px-3 py-2 border-b border-l border-[var(--line)] align-middle text-center text-[var(--muted)]">
                          —
                        </td>
                      );
                    }
                    const entries = cell.map((a: any) => ({
                      assignmentId: a.id as string,
                      associateId: a.associate_id as string,
                      name: formatFullName(a.profiles?.first_name, a.profiles?.last_name),
                      windowLabel: a.workstation_windows?.label ?? null,
                      isImmune: Boolean(a.profiles?.is_immune),
                      onLeave: isOnLeave(a.associate_id, date),
                    }));
                    return (
                      <td key={date} className="px-2 sm:px-3 py-2 border-b border-l border-[var(--line)] align-top">
                        <ScheduleCell
                          workstationId={station.id}
                          workstationName={station.name}
                          date={date}
                          entries={entries}
                          headcount={workstationHeadcounts?.[station.id]}
                          canManage={canManage}
                          associates={associates ?? []}
                          stationByAssociate={stationByAssociatePerDate.get(date)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={workDates.length + 1} className="py-4 text-[var(--muted)]">
                  No schedule has been generated for this week yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default async function SchedulePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = canManageOperations(profile.role);

  const today = todayInManila();
  const thisWeekStart = startOfWorkWeek(today);
  // Holidays for the next 2 weeks so nextWorkday skips them.
  const schedHolidayDates = await holidayDateSet(supabase, today, addDays(today, 14));
  // Next WORKING day — on a Friday the reveal at 12 PM unlocks Monday, not
  // Saturday, which has no schedule at all. Holidays are also skipped.
  const tomorrow = nextWorkday(today, schedHolidayDates);

  // --- Task-based schedule blocking (associates/OIC only) ---
  // Only APPROVED completions unlock schedule — pending/rejected don't count
  let blockingTaskCount = 0;
  let blockedDatesCurrentWeek = new Set<string>();
  let blockNextWeekEntirely = false;
  // Populated by the daily-reveal branch, which can partially unlock next
  // week (Friday afternoon reveals Monday).
  let nextWeekBlockedDatesEarly: Set<string> | null = null;
  // Inside the blocking window before the password expires (BLOCK_WITHIN_DAYS,
  // currently day 60 of a 70-day cycle) — or already expired,
  // or never baselined) the upcoming schedule locks, exactly as an
  // outstanding task locks it. Rule 1 on the floor is that nobody's password
  // is allowed to lapse, so this is the enforcement behind it.
  const credential = canManage
    ? { lastResetAt: null, blocking: false }
    : await credentialBlock(profile.id);

  if (!canManage) {
    const admin = createAdminClient();
    const [{ data: myTasks }, { data: myCompletions }] = await Promise.all([
      admin
        .from("member_tasks")
        .select("id, deadline, blocker_days_before, assign_to")
        .or(`assign_to.eq.all,assign_to.eq.${profile.id}`),
      admin
        .from("member_task_completions")
        .select("task_id, status")
        .eq("profile_id", profile.id),
    ]);
    // Only approved completions count
    const approvedIds = new Set(
      (myCompletions ?? [])
        .filter((c: { status: string }) => c.status === "approved")
        .map((c: { task_id: string }) => c.task_id),
    );
    const incompleteTasks = (myTasks ?? []).filter(
      (t: { id: string }) => !approvedIds.has(t.id),
    );
    blockingTaskCount = incompleteTasks.filter(
      (t: { deadline: string | null; blocker_days_before: number }) => isTaskBlockingToday(t),
    ).length;

    if (blockingTaskCount > 0 || credential.blocking) {
      // Block future dates: tomorrow and beyond in current week
      const currentWorkDates = workDatesForWeek(thisWeekStart);
      for (const d of currentWorkDates) {
        if (d > today) blockedDatesCurrentWeek.add(d);
      }
      blockNextWeekEntirely = true;
    } else {
      // No task blocking — apply the daily reveal rule: today is always
      // visible, the next working day unlocks at 12 PM, everything beyond
      // stays hidden until its own turn comes.
      //
      // On a Friday the next working day is MONDAY, which lives in next
      // week — so the rule has to reach across the week boundary rather than
      // blocking next week wholesale, or Friday afternoon would never reveal
      // anything.
      const revealed = isTomorrowRevealed();
      const isBlocked = (d: string) => (d > tomorrow ? true : d === tomorrow ? !revealed : false);

      for (const d of workDatesForWeek(thisWeekStart)) {
        if (isBlocked(d)) blockedDatesCurrentWeek.add(d);
      }
      nextWeekBlockedDatesEarly = new Set(workDatesForWeek(addDays(thisWeekStart, 7)).filter(isBlocked));
      blockNextWeekEntirely = false;
    }
  }

  const [{ data: latestWeek }, { data: associates }, { data: activeWorkstations }, { data: allActive }, { data: orgSettings }] =
    await Promise.all([
      supabase.from("schedule_weeks").select("*").order("week_start_date", { ascending: false }).limit(1).maybeSingle(),
      canManage
        ? supabase.from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name")
        : Promise.resolve({ data: [] }),
      // Every role needs these now: associates render the full station list
      // as rows so a row's mere presence can't leak which station they're
      // at on a still-locked day. RLS "workstations_select_all" allows it.
      supabase.from("workstations").select("id, name, headcount").eq("is_active", true).order("name"),
      canManage
        ? supabase.from("profiles").select("id, first_name, last_name, psid, role, is_immune, is_break_immune, tenure_group").eq("is_active", true)
        : Promise.resolve({ data: [] }),
      supabase.from("org_settings").select("schedule_cadence").limit(1).maybeSingle(),
    ]);

  const cadenceDays = orgSettings?.schedule_cadence === "biweekly" ? 14 : 7;
  const nextWeekStart = addDays(thisWeekStart, cadenceDays);

  const defaultGenerateWeekStart = addDays(
    latestWeek && latestWeek.week_start_date >= thisWeekStart ? latestWeek.week_start_date : thisWeekStart,
    cadenceDays
  );

  const sortedWorkstations = [...(activeWorkstations ?? [])].sort((a, b) => compareStationNames(a.name, b.name));
  const workstationHeadcounts: Record<string, number> = Object.fromEntries((activeWorkstations ?? []).map((w) => [w.id, w.headcount]));

  const totalMembers = allActive?.length ?? 0;
  const totalTenured = (allActive ?? []).filter((p) => p.role !== "team_leader" && p.tenure_group === "tenured").length;
  const totalNewHire = (allActive ?? []).filter((p) => p.role !== "team_leader" && p.tenure_group === "new_hire").length;
  const immuneMembers = (allActive ?? [])
    .filter((p) => p.is_immune && p.role !== "team_leader")
    .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));

  const [{ data: currentWeek }, { data: nextWeek }] = await Promise.all([
    supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", thisWeekStart).maybeSingle(),
    supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", nextWeekStart).maybeSingle(),
  ]);

  // Build blocked dates set for next week
  const nextWeekBlockedDates = new Set<string>();
  if (blockNextWeekEntirely) {
    for (const d of workDatesForWeek(nextWeekStart)) nextWeekBlockedDates.add(d);
  } else if (nextWeekBlockedDatesEarly) {
    // Recomputed against the real next-week start, which follows the org's
    // cadence and isn't necessarily thisWeekStart + 7.
    const revealed = isTomorrowRevealed();
    for (const d of workDatesForWeek(nextWeekStart)) {
      if (d > tomorrow || (d === tomorrow && !revealed)) nextWeekBlockedDates.add(d);
    }
  }

  return (
    <>
      <PageHeader
        title="Weekly Schedule"
        subtitle="Monday–Friday (Philippine time), regenerated every week — station headcount is fixed on Workstations"
        action={
          canManage && (
            <div className="flex items-center gap-2">
              <Button href="/schedule/history">History →</Button>
              <GenerateButton
                workstations={sortedWorkstations}
                totalMembers={totalMembers}
                totalTenured={totalTenured}
                totalNewHire={totalNewHire}
                immuneMembers={immuneMembers}
                defaultWeekStart={defaultGenerateWeekStart}
              />
            </div>
          )
        }
      />

      {canManage && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          <Card label="Total headcount" value={String(totalMembers)} sub="Team Leader, OIC & associates" />
          <Card label="Tenured associates" value={String(totalTenured)} sub="Available to assign" />
          <Card label="New Hire associates" value={String(totalNewHire)} sub="Available to assign" />
        </div>
      )}

      {!canManage && credential.blocking && (
        <div className="mb-4 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-4 py-3">
          <div className="text-[13px] font-bold text-[var(--bad)]">
            Password expiry is locking your upcoming schedule
          </div>
          <p className="text-[12.5px] text-[var(--ink)] m-0 mt-1 leading-snug">
            Reset your password on the platform and report it on{" "}
            <a href="/account" className="font-bold text-[var(--accent-strong)] hover:underline">
              Account Security
            </a>
            . Your schedule unlocks once the Team Leader confirms it.
          </p>
        </div>
      )}
      {!canManage && blockingTaskCount > 0 && (
        <div className="mb-4">
          <TaskBlockBanner taskCount={blockingTaskCount} />
        </div>
      )}

      <WeekTabs
        current={
          <WeekPanel
            supabase={supabase}
            viewerId={profile.id}
            allStations={sortedWorkstations}
            week={currentWeek}
            weekStart={thisWeekStart}
            canManage={canManage}
            associates={associates ?? []}
            workstationHeadcounts={canManage ? workstationHeadcounts : undefined}
            blockedDates={blockedDatesCurrentWeek.size > 0 ? blockedDatesCurrentWeek : undefined}
          />
        }
        next={
          <WeekPanel
            supabase={supabase}
            viewerId={profile.id}
            allStations={sortedWorkstations}
            week={nextWeek}
            weekStart={nextWeekStart}
            canManage={canManage}
            associates={associates ?? []}
            workstationHeadcounts={canManage ? workstationHeadcounts : undefined}
            // One panel, one set: empty for a manager, every day for a
            // task-blocked member, and all-but-the-revealed-day otherwise —
            // which is what lets Friday afternoon show Monday.
            blockedDates={nextWeekBlockedDates.size > 0 ? nextWeekBlockedDates : undefined}
          />
        }
      />

      {canManage && (
        <Panel
          title="Rotation Settings"
          hint="Team Leader only"
          footnote="Immune members are excluded from the weekly shuffle and must be placed manually when generating. Same break keeps a member on the break time they already have instead of reshuffling it each week — independent of station immunity, so someone can have either without the other. A member with no break time yet gets one on the next generate, and keeps it from then on. Tenure (OIC and associates) feeds the Tenured/New Hire quotas in the Generate modal."
        >
          <RotationSettingsPanel
            members={(allActive ?? [])
              .filter((p) => p.role !== "team_leader")
              .sort((a, b) => {
                const numA = Number(a.psid);
                const numB = Number(b.psid);
                if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
                return a.psid.localeCompare(b.psid);
              })}
          />
        </Panel>
      )}
    </>
  );
}
