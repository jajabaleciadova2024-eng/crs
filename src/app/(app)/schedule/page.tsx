// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill } from "@/components/ui";
import ReassignForm from "./ReassignForm";
import GenerateButton from "./GenerateButton";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SchedulePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = canManageOperations(profile.role);

  const thisWeekStart = startOfWeek(new Date()).toISOString().slice(0, 10);

  // Show whichever is more current: this calendar week, or the latest
  // generated week if the Team Leader/OIC has already generated ahead.
  const { data: latestWeek } = await supabase
    .from("schedule_weeks")
    .select("*")
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const week = latestWeek && latestWeek.week_start_date >= thisWeekStart ? latestWeek : null;
  const weekStart = week?.week_start_date ?? thisWeekStart;

  const { data: assignments } = week
    ? await supabase
        .from("assignments")
        .select("*, workstations(name), profiles(first_name, last_name, is_immune)")
        .eq("schedule_week_id", week.id)
        .order("workstation_id")
    : { data: [] };

  const { data: associates } = canManage
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("is_active", true)
        .order("first_name")
    : { data: [] };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Weekly Schedule</h1>
        <p className="text-sm text-[var(--muted)] m-0">One associate per station, regenerated every week</p>
      </header>

      <Panel
        title={`Week of ${weekStart}`}
        action={canManage && <GenerateButton />}
        footnote="Immune associates keep their previous station; everyone else is reshuffled across the remaining stations."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Station</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Assigned to</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Immune</th>
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
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {a.profiles?.is_immune ? <Pill tone="accent">Immune</Pill> : <span className="text-[var(--muted)]">—</span>}
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
                  <td colSpan={canManage ? 4 : 3} className="py-4 text-[var(--muted)]">
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
