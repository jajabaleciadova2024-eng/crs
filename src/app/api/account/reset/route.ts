import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadResetProof } from "@/lib/credentialStorage";
import { bellNotify } from "@/lib/bellNotify";

const MAX_BYTES = 10 * 1024 * 1024;

// A member declaring "I have reset my password", attaching a screenshot of
// the platform's own Security info > Password > "Last updated" as proof —
// that page is authoritative, carries the timestamp, and is always in the
// same place, which a confirmation email is not.
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
    return NextResponse.json(
      { error: "Attach a screenshot of Security info > Password > Last updated." },
      { status: 400 },
    );
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
  // Same reasoning as a self-verified upload: the Team Leader confirms
  // resets, so making them file a claim and then confirm their own is a
  // round trip that checks nothing. Theirs is recorded as confirmed on
  // submission, reviewed by themselves, and still keeps the proof and the
  // history entry.
  const { data: submitter } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const selfConfirms = submitter?.role === "team_leader";

  const { data: cred } = await admin
    .from("credential_status")
    .select("mfa_proof_path, mfa_verified")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!cred?.mfa_proof_path) {
    return NextResponse.json(
      { error: "Upload your MFA screenshot before reporting a password reset." },
      { status: 400 },
    );
  }
  if (!cred.mfa_verified) {
    return NextResponse.json(
      { error: "Your MFA screenshot is still waiting on the Team Leader to verify it." },
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

  const now = new Date().toISOString();
  const { error } = await admin.from("password_resets").insert({
    profile_id: user.id,
    reset_at: resetAt.toISOString(),
    proof_path: path,
    status: selfConfirms ? "approved" : "pending",
    reviewed_by: selfConfirms ? user.id : null,
    reviewed_at: selfConfirms ? now : null,
  });
  if (error) {
    console.error("[account/reset] insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Confirmed on the spot, so start the 60 days now — there is no second
  // step coming that would otherwise do it.
  if (selfConfirms) {
    await admin.from("credential_status").upsert(
      { profile_id: user.id, last_reset_at: resetAt.toISOString(), updated_at: now },
      { onConflict: "profile_id" },
    );
    return NextResponse.json({ ok: true, status: "approved" });
  }

  const { data: leaders } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "team_leader")
    .eq("is_active", true);
  await bellNotify((leaders ?? []).map((l: { id: string }) => l.id), user.id, "password_reset_submitted");

  return NextResponse.json({ ok: true });
}
