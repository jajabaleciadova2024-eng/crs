import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/ui";
import AddMemberForm from "./AddMemberForm";
import MemberRow from "./MemberRow";

export default async function TeamPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader"]);

  const supabase = await createClient();
  const { data: rawMembers } = await supabase.from("profiles").select("*");
  // Sorted numerically by PSID (lowest first) rather than lexicographically,
  // so "9" sorts before "10" regardless of digit count. Includes every
  // role — Team Leader, OIC, and associates all show here.
  const members = [...(rawMembers ?? [])].sort((a, b) => {
    const numA = Number(a.psid);
    const numB = Number(b.psid);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.psid.localeCompare(b.psid);
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Team &amp; Roles</h1>
        <p className="text-sm text-[var(--muted)] m-0">Add, remove, and assign roles for members — Team Leader only</p>
      </header>

      <Panel
        title="Roster"
        action={<AddMemberForm />}
        footnote="New members receive an email invite to set their own password. Login accepts PSID or email. Tenure grouping (associates only) is manual — no auto-promotion by date, and it's not yet used by the schedule generator."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">PSID</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Email</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Mobile</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Role</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Immune</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Tenure</th>
                <th className="py-2.5 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {members && members.length > 0 ? (
                members.map((m) => <MemberRow key={m.id} member={m} isSelf={m.id === profile.id} />)
              ) : (
                <tr>
                  <td colSpan={8} className="py-4 text-[var(--muted)]">
                    No members yet.
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
