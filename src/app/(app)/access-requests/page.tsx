import { requireProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Panel, Pill, PageHeader } from "@/components/ui";
import { formatFullName } from "@/lib/format";
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
  const [{ data: pending }, { data: recent }] = await Promise.all([
    supabase.from("access_requests").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    supabase.from("access_requests").select("*").neq("status", "pending").order("reviewed_at", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <PageHeader title="Access Requests" subtitle="People who asked for an account from the sign-in page — Team Leader only" />

      <Panel
        title="Pending"
        hint={`${pending?.length ?? 0} waiting`}
        footnote="Approving always creates an Associate account and invites the person by email, same as adding a member from Team & Roles — just assign a PSID. Need to add a Team Leader or OIC instead? Use Team & Roles directly."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">PSID</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Email</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Mobile</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Message</th>
                <th className="py-2.5 border-b border-[var(--line)]" />
              </tr>
            </thead>
            <tbody>
              {pending && pending.length > 0 ? (
                pending.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.psid ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {formatFullName(r.first_name, r.last_name)}
                    </td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.email}</td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.mobile_number ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.message ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      <ReviewForm requestId={r.id} suggestedPsid={r.psid} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-[var(--muted)]">
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
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Email</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Mobile</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent && recent.length > 0 ? (
                recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      {formatFullName(r.first_name, r.last_name)}
                    </td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.email}</td>
                    <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.mobile_number ?? "—"}</td>
                    <td className="py-2.5 border-b border-[var(--line)]">
                      <Pill tone={STATUS_TONE[r.status as AccessRequestStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-[var(--muted)]">
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
