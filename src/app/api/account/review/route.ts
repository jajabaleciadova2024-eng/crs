import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";

// The Team Leader confirming (or rejecting) a member's claimed reset.
// Confirming is the ONLY thing that restarts the countdown (see
// PASSWORD_VALID_DAYS in src/lib/passwordExpiry.ts for the length).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can confirm a reset." }, { status: 403 });
  }

  const body = await request.json();
  const { reset_id, status } = body;
  const review_note = (body.review_note ?? "").trim() || null;
  if (!reset_id) return NextResponse.json({ error: "reset_id is required." }, { status: 400 });
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'." }, { status: 400 });
  }
  // Same rule as declining a task: a rejection the member can't act on is
  // just a dead end.
  if (status === "rejected" && !review_note) {
    return NextResponse.json({ error: "Please give a reason for rejecting." }, { status: 400 });
  }

  const { data: reset } = await admin
    .from("password_resets")
    .select("id, profile_id, reset_at, status")
    .eq("id", reset_id)
    .single();
  if (!reset) return NextResponse.json({ error: "Reset not found." }, { status: 404 });
  if (reset.status !== "pending") {
    return NextResponse.json({ error: "That reset has already been reviewed." }, { status: 400 });
  }

  // Confirming without MFA evidence would restart the clock on an account
  // that is not compliant, which is the one thing this must never do. A
  // missing PASSKEY is deliberately not a gate — wanted, but not required.
  if (status === "approved") {
    const { data: cred } = await admin
      .from("credential_status")
      .select("mfa_proof_path, mfa_verified")
      .eq("profile_id", reset.profile_id)
      .maybeSingle();
    if (!cred?.mfa_proof_path) {
      return NextResponse.json(
        { error: "This member has no MFA screenshot on file — it must be uploaded before you can confirm." },
        { status: 400 },
      );
    }
    if (!cred.mfa_verified) {
      return NextResponse.json(
        { error: "Verify this member's MFA screenshot before confirming their reset." },
        { status: 400 },
      );
    }
  }

  const { error } = await admin
    .from("password_resets")
    .update({ status, review_note, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", reset_id);
  if (error) {
    console.error("[account/review] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The clock restarts from the member's stated reset moment, not from now:
  // a confirmation that arrives three days late must not hand out three
  // extra days of validity.
  if (status === "approved") {
    await admin.from("credential_status").upsert(
      { profile_id: reset.profile_id, last_reset_at: reset.reset_at, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" },
    );
  }

  await bellNotify([reset.profile_id], user.id, "password_reset_reviewed");
  return NextResponse.json({ ok: true });
}
