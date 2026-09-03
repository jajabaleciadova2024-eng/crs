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

  // Scoped to the caller unless they manage: a member's request never even
  // loads anyone else's credential state, so there is nothing to leak into
  // the payload by a later mistake. password_resets has two FKs to profiles
  // (profile_id, reviewed_by), hence the explicit FK name on the embed.
  const statusQuery = admin.from("credential_status").select("*");
  const resetQuery = admin
    .from("password_resets")
    .select("*, profiles!password_resets_profile_id_fkey(first_name, last_name)")
    .order("submitted_at", { ascending: false });

  const [{ data: statuses }, { data: resets }, { data: members }] = await Promise.all([
    canManage ? statusQuery : statusQuery.eq("profile_id", profile.id),
    canManage ? resetQuery : resetQuery.eq("profile_id", profile.id),
    canManage
      ? admin.from("profiles").select("id, first_name, last_name, role").eq("is_active", true).order("first_name")
      : Promise.resolve({ data: [] }),
  ]);

  const statusByProfile = new Map((statuses ?? []).map((s: any) => [s.profile_id, s]));
  const mine = statusByProfile.get(profile.id) ?? null;
  const myPending = (resets ?? []).find(
    (r: any) => r.profile_id === profile.id && r.status === "pending",
  );
  const myHistory = (resets ?? []).filter((r: any) => r.profile_id === profile.id).slice(0, 5);

  // Team Leader only. Built inside the guard rather than filtered in the
  // component: a non-manager must never receive other members' credential
  // data in their page payload, where hiding the table would leave it
  // sitting in the HTML for anyone who looks.
  //
  // Everyone appears, including members who have never had a baseline set —
  // an unmonitored account is exactly what this page exists to surface, so
  // it must not be able to hide by having no row.
  const rows: OversightRow[] = !canManage ? [] : (members ?? []).map((m: any) => {
    const st = statusByProfile.get(m.id);
    const pending = (resets ?? []).find((r: any) => r.profile_id === m.id && r.status === "pending");
    // The most recent reset that actually carries a screenshot, whatever its
    // status. Without this the proof was reachable only while a claim sat
    // pending, so a confirmed reset could never be looked at again.
    const latestWithProof = (resets ?? []).find((r: any) => r.profile_id === m.id && r.proof_path);
    return {
      profileId: m.id,
      name: formatFullName(m.first_name, m.last_name),
      role: m.role,
      lastResetAt: st?.last_reset_at ?? null,
      mfa: !!st?.mfa_proof_path,
      mfaVerified: !!st?.mfa_verified,
      passkey: !!st?.passkey_proof_path,
      passkeyVerified: !!st?.passkey_verified,
      pendingResetId: pending?.id ?? null,
      pendingResetAt: pending?.reset_at ?? null,
      pendingHasProof: !!pending?.proof_path,
      lastProofResetId: latestWithProof?.id ?? null,
      lastProofStatus: (latestWithProof?.status as string | null) ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Account Security"
        subtitle={canManage
          ? "Passwords expire 60 days after each reset — keep yours alive, and oversee everyone else's"
          : "Your password expires 60 days after each reset — keep it alive, and get MFA and your passkey configured"}
      />

      <MyCredentialPanel
        lastResetAt={mine?.last_reset_at ?? null}
        mfaProof={!!mine?.mfa_proof_path}
        mfaVerified={!!mine?.mfa_verified}
        mfaNote={mine?.mfa_review_note ?? null}
        passkeyProof={!!mine?.passkey_proof_path}
        passkeyVerified={!!mine?.passkey_verified}
        passkeyNote={mine?.passkey_review_note ?? null}
        isTeamLeader={canManage}
        pending={myPending ? { id: myPending.id, resetAt: myPending.reset_at } : null}
        history={myHistory.map((r: any) => ({
          id: r.id,
          resetAt: r.reset_at,
          status: r.status,
          reviewNote: r.review_note,
          hasProof: !!r.proof_path,
        }))}
      />

      {canManage && <CredentialOversight rows={rows} viewerId={profile.id} />}
    </>
  );
}
