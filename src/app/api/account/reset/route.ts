import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadResetProof } from "@/lib/credentialStorage";
import { bellNotify } from "@/lib/bellNotify";

const MAX_BYTES = 10 * 1024 * 1024;

// A member declaring "I have reset my password", attaching the platform's
// confirmation email as proof.
// This does NOT restart the countdown — only the Team Leader's confirmation
// does (see ../review). A claim is a claim until somebody checks it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const proof = form.get("proof");
  const resetAtRaw = (form.get("reset_at") as string) || "";

  if (!(proof instanceof File) || proof.size === 0) {
    return NextResponse.json({ error: "Attach the email confirmation of the reset." }, { status: 400 });
  }
  if (proof.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (10MB max)." }, { status: 400 });
  }
  if (!proof.type.startsWith("image/")) {
    return NextResponse.json({ error: "Proof must be an image." }, { status: 400 });
  }

  // The reset date drives the whole 60-day clock, so a future one would hand
  // the member free time they haven't earned.
  const resetAt = resetAtRaw ? new Date(resetAtRaw) : new Date();
  if (Number.isNaN(resetAt.getTime())) {
    return NextResponse.json({ error: "That reset date isn't valid." }, { status: 400 });
  }
  if (resetAt.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "The reset date can't be in the future." }, { status: 400 });
  }

  const admin = createAdminClient();

  // MFA proof is a hard prerequisite. The button is hidden without it, but
  // this is the half that actually holds: a reset reported by someone with
  // no MFA on file would restart a 60-day clock on a non-compliant account.
  const { data: cred } = await admin
    .from("credential_status")
    .select("mfa_proof_path")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!cred?.mfa_proof_path) {
    return NextResponse.json(
      { error: "Upload your MFA screenshot before reporting a password reset." },
      { status: 400 },
    );
  }

  // One open claim at a time — a second submission while the first is still
  // being reviewed just gives the Team Leader two of the same thing to judge.
  const { data: open } = await admin
    .from("password_resets")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (open) {
    return NextResponse.json(
      { error: "You already have a reset awaiting confirmation." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await proof.arrayBuffer());
  const path = `${user.id}/${Date.now()}-${proof.name}`;
  const uploaded = await uploadResetProof(path, proof.type || "image/png", buffer);
  if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  const { error } = await admin.from("password_resets").insert({
    profile_id: user.id,
    reset_at: resetAt.toISOString(),
    proof_path: path,
    status: "pending",
  });
  if (error) {
    console.error("[account/reset] insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: leaders } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "team_leader")
    .eq("is_active", true);
  await bellNotify((leaders ?? []).map((l: { id: string }) => l.id), user.id, "password_reset_submitted");

  return NextResponse.json({ ok: true });
}
