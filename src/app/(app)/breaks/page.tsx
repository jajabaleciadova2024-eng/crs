// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, PageHeader, Pill } from "@/components/ui";
import { todayInManila, startOfWorkWeek, isWorkday, workDatesForWeek, weekdayShortLabel, isTomorrowRevealed, addDays } from "@/lib/scheduleDates";
import { BREAK_SLOTS, BREAK_SLOT_LABEL, type BreakSlot } from "@/lib/breakTime";
import { compareStationNames } from "@/lib/stationOrder";
import { compareWindowLabels } from "@/lib/windowOrder";
import { formatFullName } from "@/lib/format";
import BreakDayTabs from "./BreakDayTabs";
import BreakSlotCell from "./BreakSlotCell";

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export default async function BreaksPage() {
  const profile = await requireProfile();
  const canManage = canManageOperations(profile.role);
  const supabase = await createClient();

  const today = todayInManila();
  const weekStart = startOfWorkWeek(today);
  const tomorrow = addDays(today, 1);

  const [{ data: week }, { data: stations }] = await Promise.all([
    supabase.from("schedule_weeks").select("id, week_start_date").eq("week_start_date", weekStart).maybeSingle(),
    supabase.from("workstations").select("id, name, man_priority, min_manned, is_reliever, can_be_pulled").eq("is_active", true),
  ]);

  const workDates = workDatesForWeek(weekStart);
  // Same reveal rule as the schedule: today always, tomorrow from 12 PM,
  // nothing further out. Managers see the whole week.
  const visibleDates = canManage
    ? workDates
    : workDates.filter((d) => d <= today || (d === tomorrow && isTomorrowRevealed()));

  const [{ data: breaks }, { data: assignments }] = await Promise.all([
    week
      ? supabase
          .from("break_assignments")
          .select("*, workstation_windows(label, workstation_id), profiles!break_assignments_associate_id_fkey(first_name, last_name)")
          .eq("schedule_week_id", week.id)
      : Promise.resolve({ data: [] }),
    week
      ? supabase
          .from("assignments")
          .select("associate_id, assignment_date, workstation_id, window_id, workstation_windows(label)")
          .eq("schedule_week_id", week.id)
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

  const days = visibleDates.map((date) => {
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

  return (
    <>
      <PageHeader
        title="Break Schedule"
        subtitle="Staggered breaks at 10 AM, 11 AM and 12 PM — generated with the weekly schedule so a station is never left unmanned"
      />

      {!week ? (
        <Panel title="No schedule this week">
          <p className="text-sm text-[var(--muted)] m-0">
            Breaks are generated together with the weekly schedule. Generate this week&apos;s schedule and the break
            times will appear here.
          </p>
        </Panel>
      ) : days.length === 0 ? (
        <Panel title="Nothing to show yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Tomorrow&apos;s breaks are revealed at 12 PM Philippine time, along with the schedule.
          </p>
        </Panel>
      ) : (
        <BreakDayTabs
          days={days.map((d) => ({
            date: d.date,
            label: d.label,
            isToday: d.isToday,
            content: (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {d.slots.map(({ slot, entries, coverage }) => (
                  <Panel key={slot} title={BREAK_SLOT_LABEL[slot]} hint={`${entries.length} on break`}>
                    <BreakSlotCell
                      slot={slot}
                      date={d.date}
                      entries={entries}
                      canManage={canManage}
                    />
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
      )}
    </>
  );
}
