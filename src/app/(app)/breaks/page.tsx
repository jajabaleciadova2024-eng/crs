// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, PageHeader, Pill } from "@/components/ui";
import { todayInManila, startOfWorkWeek, workDatesForWeek, weekdayShortLabel, isTomorrowRevealed, nextWorkday, addDays } from "@/lib/scheduleDates";
import { BREAK_SLOTS, BREAK_SLOT_LABEL, type BreakSlot } from "@/lib/breakTime";
import { compareStationNames } from "@/lib/stationOrder";
import { compareWindowLabels } from "@/lib/windowOrder";
import { formatFullName } from "@/lib/format";
import WeekTabs from "../schedule/WeekTabs";
import BreakDayTabs from "./BreakDayTabs";
import BreakSlotCell from "./BreakSlotCell";

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export default async function BreaksPage() {
  const profile = await requireProfile();
  const canManage = canManageOperations(profile.role);
  const supabase = await createClient();
  // Names come through the admin client on purpose. The break schedule is a
  // floor-coordination tool — everyone needs to see who is away and who is
  // covering — but "profiles_select_own_or_leadership" hides every other
  // member's row from an associate, which would render the whole slot list
  // nameless. Same reasoning as the Dashboard's mentionable list.
  const admin = createAdminClient();

  const today = todayInManila();
  const weekStart = startOfWorkWeek(today);
  // Next WORKING day, so Friday reveals Monday rather than a blank Saturday.
  const tomorrow = nextWorkday(today);

  const [{ data: stations }, { data: orgSettings }] = await Promise.all([
    supabase.from("workstations").select("id, name, man_priority, min_manned, is_reliever, can_be_pulled").eq("is_active", true),
    supabase.from("org_settings").select("schedule_cadence").limit(1).maybeSingle(),
  ]);
  const cadenceDays = orgSettings?.schedule_cadence === "biweekly" ? 14 : 7;
  const nextWeekStart = addDays(weekStart, cadenceDays);

  // BOTH weeks, not just the current one: Generate produces the UPCOMING
  // week's schedule, so looking only at the current week showed "no schedule"
  // immediately after generating — which is exactly when you want to check it.
  const [{ data: currentWeek }, { data: nextWeek }] = await Promise.all([
    supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", weekStart).maybeSingle(),
    supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", nextWeekStart).maybeSingle(),
  ]);

  const weeks = [
    { row: currentWeek, start: weekStart, label: "Current Week" },
    { row: nextWeek, start: nextWeekStart, label: "Next Week" },
  ].filter((w) => w.row);

  const week = currentWeek ?? nextWeek;

  const weekIds = weeks.map((w) => w.row!.id);
  const [{ data: breaks }, { data: assignments }] = await Promise.all([
    weekIds.length > 0
      ? admin
          .from("break_assignments")
          .select("*, workstation_windows(label, workstation_id), profiles!break_assignments_associate_id_fkey(first_name, last_name)")
          .in("schedule_week_id", weekIds)
      : Promise.resolve({ data: [] }),
    weekIds.length > 0
      ? admin
          .from("assignments")
          .select("associate_id, assignment_date, workstation_id, window_id, workstation_windows(label)")
          .in("schedule_week_id", weekIds)
      : Promise.resolve({ data: [] }),
  ]);

  // On-leave flags, same as the Weekly Schedule table.
  const involvedIds = [...new Set((breaks ?? []).map((b: any) => b.associate_id))];
  const { data: leaveOnRecord } =
    involvedIds.length > 0
      ? await supabase
          .from("leave_requests")
          .select("associate_id, start_date, end_date, leave_request_ranges(start_date, end_date)")
          .eq("status", "approved")
          .in("associate_id", involvedIds)
      : { data: [] };

  const leaveByAssociate = new Map<string, { start_date: string; end_date: string }[]>();
  for (const lr of leaveOnRecord ?? []) {
    const ranges = [{ start_date: lr.start_date, end_date: lr.end_date }, ...((lr as any).leave_request_ranges ?? [])];
    leaveByAssociate.set(lr.associate_id, [...(leaveByAssociate.get(lr.associate_id) ?? []), ...ranges]);
  }
  const isOnLeave = (id: string, date: string) =>
    (leaveByAssociate.get(id) ?? []).some((r) => rangesOverlap(r.start_date, r.end_date, date, date));

  const stationById = new Map((stations ?? []).map((s: any) => [s.id, s]));
  const sortedStations = [...(stations ?? [])].sort((a: any, b: any) => compareStationNames(a.name, b.name));

  // Everyone seated that day, per station — the denominator for coverage.
  function seatedFor(date: string, stationId: string) {
    return (assignments ?? []).filter((a: any) => a.assignment_date === date && a.workstation_id === stationId);
  }

  // Reveal rule per date: today always, the next working day from 12 PM,
  // nothing beyond. Managers see everything.
  const revealed = isTomorrowRevealed();
  const isVisible = (d: string) => canManage || d <= today || (d === tomorrow && revealed);

  const buildDays = (weekStartDate: string) => workDatesForWeek(weekStartDate).filter(isVisible).map((date) => {
    const dayBreaks = (breaks ?? []).filter((b: any) => b.assignment_date === date);

    const slots = BREAK_SLOTS.map((slot) => {
      const inSlot = dayBreaks
        .filter((b: any) => b.break_slot === slot)
        .map((b: any) => ({
          id: b.id,
          windowLabel: b.workstation_windows?.label ?? "",
          workstationId: b.workstation_windows?.workstation_id ?? "",
          stationName: stationById.get(b.workstation_windows?.workstation_id)?.name ?? "",
          associateId: b.associate_id,
          name: formatFullName(b.profiles?.first_name, b.profiles?.last_name),
          relieverId: b.reliever_associate_id,
          onLeave: isOnLeave(b.associate_id, date),
          isMine: b.associate_id === profile.id,
        }))
        .sort((a: any, z: any) => compareWindowLabels(a.windowLabel, z.windowLabel));

      // Coverage per station in this slot — how many windows are left manned.
      const coverage = sortedStations
        .map((s: any) => {
          const total = seatedFor(date, s.id).length;
          const outRows = inSlot.filter((b: any) => b.workstationId === s.id);
          // A relieved window is still manned — someone is physically there,
          // just not the usual person. Only unrelieved breaks reduce cover.
          const uncovered = outRows.filter((b: any) => !b.relieverId).length;
          return {
            id: s.id,
            name: s.name,
            total,
            remaining: total - uncovered,
            relieved: outRows.length - uncovered,
            minManned: s.min_manned ?? 1,
            priority: s.man_priority,
          };
        })
        .filter((c) => c.total > 0);

      return { slot: slot as BreakSlot, entries: inSlot, coverage };
    });

    return { date, label: `${weekdayShortLabel(date)} ${date.slice(5)}`, slots, isToday: date === today };
  });

  // One day-tab strip per week that actually has a schedule, wrapped in
  // Current/Next tabs to match the Weekly Schedule page.
  function renderWeek(weekStartDate: string) {
    const days = buildDays(weekStartDate);
    if (days.length === 0) {
      return (
        <Panel title="Nothing to show yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Each day&apos;s breaks are revealed at 12 PM Philippine time the working day before, along with the
            schedule.
          </p>
        </Panel>
      );
    }
    return (
      <BreakDayTabs
        days={days.map((d) => ({
          date: d.date,
          label: d.label,
          isToday: d.isToday,
          content: (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {d.slots.map(({ slot, entries, coverage }) => (
                <Panel key={slot} title={BREAK_SLOT_LABEL[slot]} hint={`${entries.length} on break`}>
                  <BreakSlotCell slot={slot} date={d.date} entries={entries} canManage={canManage} />
                  {coverage.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--line)] flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">
                        Manned during this break
                      </span>
                      {coverage.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                          <span className="text-[var(--muted)] truncate">
                            {c.priority ? `${c.priority}. ` : ""}
                            {c.name}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {c.relieved > 0 && <Pill tone="accent">+{c.relieved} relieved</Pill>}
                            <Pill tone={c.remaining < c.minManned ? "bad" : c.remaining === c.minManned ? "warn" : "good"}>
                              {c.remaining}/{c.total}
                            </Pill>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          ),
        }))}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Break Schedule"
        subtitle="Staggered breaks at 10 AM, 11 AM and 12 PM — generated with the weekly schedule so a station is never left unmanned"
      />

      {weeks.length === 0 ? (
        <Panel title="No schedule generated yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Breaks are generated together with the weekly schedule. Generate a schedule and the break times will
            appear here.
          </p>
        </Panel>
      ) : weeks.length === 1 ? (
        renderWeek(weeks[0].start)
      ) : (
        <WeekTabs current={renderWeek(weekStart)} next={renderWeek(nextWeekStart)} />
      )}
    </>
  );
}
