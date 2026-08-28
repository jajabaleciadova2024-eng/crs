import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, PageHeader } from "@/components/ui";
import AddWorkstationForm from "./AddWorkstationForm";
import WorkstationRow from "./WorkstationRow";
import { compareStationNames } from "@/lib/stationOrder";

export default async function WorkstationsPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader"]);

  const supabase = await createClient();
  const [{ data: rawWorkstations }, { data: windows }] = await Promise.all([
    supabase.from("workstations").select("*"),
    supabase.from("workstation_windows").select("*"),
  ]);
  // Team Leader's standing station order, not alphabetical — same order
  // used on the dashboard, Weekly Schedule, and the Generate modal.
  const workstations = rawWorkstations ? [...rawWorkstations].sort((a, b) => compareStationNames(a.name, b.name)) : rawWorkstations;

  // Group windows by station so each row gets only its own.
  const windowsByStation = new Map<string, typeof windows>();
  for (const w of windows ?? []) {
    windowsByStation.set(w.workstation_id, [...(windowsByStation.get(w.workstation_id) ?? []), w]);
  }

  return (
    <>
      <PageHeader title="Workstations" subtitle="The functional stations associates rotate through, and the physical windows each one occupies" />

      <Panel title="Active stations" action={<AddWorkstationForm />}>
        <div className="overflow-x-auto scroll-shadow-x">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Station</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Headcount</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Windows</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">Status</th>
                <th className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {workstations && workstations.length > 0 ? (
                workstations.map((w) => (
                  <WorkstationRow key={w.id} workstation={w} windows={windowsByStation.get(w.id) ?? []} />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--muted)]">
                    No workstations yet.
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
