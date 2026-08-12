import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill } from "@/components/ui";
import ReviewForm from "./ReviewForm";
import type { AccessRequestStatus } from "@/lib/database.types";

const STATUS_TONE: Record<AccessRequestStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

export default async function AccessRequestsPage() {
  const profile = await requireProfile();
  await requireRole(profile, ["team_leader"]);

  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("access_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: recent } = await supabase
    .from("access_requests")
    .select("*")
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false })
    .limit(10);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-serif text-2xl m-0 mb-1">Access Requests</h1>
        <p className="text-sm text-[var(--muted)] m-0">
          People who asked for an account from the sign-in page — Team Leader only
        </p>
      </header>

      <Panel
        title="Pending"
        hint={`${pending?.length ?? 0} waiting`}
        footnote="Approving always creates an Associate account and invites the person by email, same as adding a member from Team & Roles — just assign a PSID. Need to add a Team Leader or OIC instead? Use Team & Roles directly."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Email</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Mobile</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Message</th>
                <th className="py-2.5 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {pending && pending.length > 0 ? (
                pending.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.email}</td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.mobile_number ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.message ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      <ReviewForm requestId={r.id} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-4 text-[var(--muted)]">
                    No pending requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recent decisions" hint="Last 10">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Email</th>
                <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent && recent.length > 0 ? (
                recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.email}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      <Pill tone={STATUS_TONE[r.status as AccessRequestStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-4 text-[var(--muted)]">
                    No decisions yet.
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
