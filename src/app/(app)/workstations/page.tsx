import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui";
import AddWorkstationForm from "./AddWorkstationForm";
import WorkstationRow from "./WorkstationRow";

export default async function WorkstationsPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader", "oic"]);

  const supabase = await createClient();
  const { data: workstations } = await supabase.from("workstations").select("*").order("name");

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Workstations</h1>
        <p className="text-sm text-[var(--muted)] m-0">The functional stations associates rotate through</p>
      </header>

      <Panel title="Active stations" action={<AddWorkstationForm />}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Station</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Description</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
                <th className="py-2.5 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {workstations && workstations.length > 0 ? (
                workstations.map((w) => <WorkstationRow key={w.id} workstation={w} />)
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-[var(--muted)]">
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
