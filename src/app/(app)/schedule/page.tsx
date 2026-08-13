// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill } from "@/components/ui";
import ReassignForm from "./ReassignForm";
import GenerateButton from "./GenerateButton";
import ClearScheduleButton from "./ClearScheduleButton";
import { todayInManila, startOfWorkWeek, endOfWorkWeek } from "@/lib/scheduleDates";
import { holidaysInRange } from "@/lib/phHolidays";

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export default async function SchedulePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = canManageOperations(profile.role);

  const thisWeekStart = startOfWorkWeek(todayInManila());

  // Show whichever is more current: this work week, or the latest
  // generated week if the Team Leader/OIC has already generated ahead.
  // latestWeek and associates are independent — run together; assignments
  // needs latestWeek's id first, so it follows in its own batch.
  const [{ data: latestWeek }, { data: associates }] = await Promise.all([
    supabase.from("schedule_weeks").select("*").order("week_start_date", { ascending: false }).limit(1).maybeSingle(),
    canManage
      ? supabase.from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name")
      : Promise.resolve({ data: [] }),
  ]);

  const week = latestWeek && latestWeek.week_start_date >= thisWeekStart ? latestWeek : null;
  const weekStart = week?.week_start_date ?? thisWeekStart;
  // Work week is Monday–Friday, not the full calendar week — schedule
  // coverage and "on leave" overlap only care about workdays.
  const weekEnd = endOfWorkWeek(weekStart);
  const holidays = holidaysInRange(weekStart, weekEnd);

  const { data: assignments } = week
    ? await supabase
        .from("assignments")
        .select(`*, workstations(name), profiles(first_name, last_name${canManage ? ", is_immune" : ""})`)
        .eq("schedule_week_id", week.id)
        .order("workstation_id")
    : { data: [] };

  // "On leave" flag: approved leave overlapping this work week, for
  // whoever's assigned — visibility only, TL decides whether/how to
  // reassign (see ReassignForm above).
  const assignedIds = (assignments ?? []).map((a: any) => a.associate_id);
  const { data: leaveOnRecord } =
    assignedIds.length > 0
      ? await supabase
          .from("leave_requests")
          .select("associate_id, start_date, end_date, leave_request_ranges(start_date, end_date)")
          .eq("status", "approved")
          .in("associate_id", assignedIds)
      : { data: [] };

  const onLeaveIds = new Set(
    (leaveOnRecord ?? [])
      .filter((lr: any) => {
        const ranges = [{ start_date: lr.start_date, end_date: lr.end_date }, ...(lr.leave_request_ranges ?? [])];
        return ranges.some((r) => rangesOverlap(r.start_date, r.end_date, weekStart, weekEnd));
      })
      .map((lr: any) => lr.associate_id)
  );

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Weekly Schedule</h1>
        <p className="text-sm text-[var(--muted)] m-0">One associate per station, Monday–Friday (Philippine time), regenerated every week</p>
      </header>

      <Panel
        title={`Week of ${weekStart} – ${weekEnd}`}
        action={
          canManage && (
            <div className="flex items-center gap-2">
              {week && <ClearScheduleButton scheduleWeekId={week.id} weekStart={weekStart} />}
              <GenerateButton />
            </div>
          )
        }
        footnote={
          canManage
            ? "Immune associates keep their previous station; everyone else is reshuffled across the remaining stations. “On leave” flags approved leave overlapping this work week — reassign manually if needed."
            : "“On leave” flags approved leave overlapping this work week."
        }
      >
        {holidays.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {holidays.map((h) => (
              <Pill key={h.date} tone="warn">
                Holiday {h.date}: {h.name}
              </Pill>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Station</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Assigned to</th>
                {canManage && <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Immune</th>}
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Leave</th>
                {canManage && <th className="py-2.5 border-b border-[var(--line)]" />}
              </tr>
            </thead>
            <tbody>
              {assignments && assignments.length > 0 ? (
                assignments.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-2.5 border-b border-[var(--line)]">{a.workstations?.name}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {a.profiles?.first_name} {a.profiles?.last_name}
                    </td>
                    {canManage && (
                      <td className="py-2.5 border-b border-[var(--line)]">
                        {a.profiles?.is_immune ? <Pill tone="accent">Immune</Pill> : <span className="text-[var(--muted)]">—</span>}
                      </td>
                    )}
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {onLeaveIds.has(a.associate_id) ? <Pill tone="bad">On leave</Pill> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    {canManage && (
                      <td className="py-2.5 border-b border-[var(--line)]">
                        <ReassignForm
                          assignmentId={a.id}
                          workstationName={a.workstations?.name ?? ""}
                          associates={associates ?? []}
                          currentAssociateId={a.associate_id}
                        />
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 5 : 3} className="py-4 text-[var(--muted)]">
                    No schedule has been generated for this week yet.
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
