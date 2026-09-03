// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Panel } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import MyCredentialPanel from "./MyCredentialPanel";
import CredentialOversight, { type OversightRow } from "./CredentialOversight";

export default async function AccountPage() {
  const profile = await requireProfile();
  const canManage = canManageOperations(profile.role);
  const admin = createAdminClient();

  const [{ data: statuses }, { data: resets }, { data: members }] = await Promise.all([
    admin.from("credential_status").select("*"),
    admin
      .from("password_resets")
      .select("*, profiles!password_resets_profile_id_fkey(first_name, last_name)")
      .order("submitted_at", { ascending: false }),
    admin.from("profiles").select("id, first_name, last_name, role").eq("is_active", true).order("first_name"),
  ]);

  const statusByProfile = new Map((statuses ?? []).map((s: any) => [s.profile_id, s]));
  const mine = statusByProfile.get(profile.id) ?? null;
  const myPending = (resets ?? []).find(
    (r: any) => r.profile_id === profile.id && r.status === "pending",
  );
  const myHistory = (resets ?? []).filter((r: any) => r.profile_id === profile.id).slice(0, 5);

  // Everyone appears, including members who have never had a baseline set —
  // an unmonitored account is exactly what this page exists to surface, so
  // it must not be able to hide by having no row.
  const rows: OversightRow[] = (members ?? []).map((m: any) => {
    const st = statusByProfile.get(m.id);
    const pending = (resets ?? []).find((r: any) => r.profile_id === m.id && r.status === "pending");
    return {
      profileId: m.id,
      name: formatFullName(m.first_name, m.last_name),
      role: m.role,
      lastResetAt: st?.last_reset_at ?? null,
      mfa: !!st?.mfa_proof_path,
      passkey: !!st?.passkey_proof_path,
      pendingResetId: pending?.id ?? null,
      pendingResetAt: pending?.reset_at ?? null,
      pendingHasProof: !!pending?.proof_path,
    };
  });

  return (
    <>
      <PageHeader
        title="Account Security"
        subtitle="Passwords expire 60 days after each reset — keep yours alive, and get MFA and your passkey configured"
      />

      <MyCredentialPanel
        lastResetAt={mine?.last_reset_at ?? null}
        mfaProof={!!mine?.mfa_proof_path}
        passkeyProof={!!mine?.passkey_proof_path}
        pending={myPending ? { id: myPending.id, resetAt: myPending.reset_at } : null}
        history={myHistory.map((r: any) => ({
          id: r.id,
          resetAt: r.reset_at,
          status: r.status,
          reviewNote: r.review_note,
          hasProof: !!r.proof_path,
        }))}
      />

      {canManage ? (
        <CredentialOversight rows={rows} />
      ) : (
        <Panel title="Everyone's status" hint="Shared board">
          <p className="text-[12.5px] text-[var(--muted)] m-0 mb-3">
            Everyone can see where the team stands — nobody&apos;s account should be the one that lapses.
          </p>
          <CredentialOversight rows={rows} readOnly />
        </Panel>
      )}
    </>
  );
}
