import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";

const KINDS = ["mfa", "passkey"] as const;
type Kind = (typeof KINDS)[number];

// The Team Leader accepting or rejecting an MFA / passkey screenshot.
// Verifying is what turns the tick green; before that it only means a file
// exists, which is not the same claim at all.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can verify a proof." }, { status: 403 });
  }

  const body = await request.json();
  const { profile_id, kind, verified } = body;
  const review_note = (body.review_note ?? "").trim() || null;

  if (!profile_id || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "profile_id and a valid kind are required." }, { status: 400 });
  }
  if (typeof verified !== "boolean") {
    return NextResponse.json({ error: "verified must be true or false." }, { status: 400 });
  }
  // A rejection the member cannot act on is a dead end — same rule as
  // rejecting a reset or declining a task.
  if (!verified && !review_note) {
    return NextResponse.json({ error: "Please say what is wrong with it." }, { status: 400 });
  }

  const { data: status } = await admin
    .from("credential_status")
    .select("mfa_proof_path, passkey_proof_path")
    .eq("profile_id", profile_id)
    .maybeSingle();
  const path = kind === "mfa" ? status?.mfa_proof_path : status?.passkey_proof_path;
  if (!path) {
    return NextResponse.json({ error: "There is no screenshot to verify." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch =
    kind === "mfa"
      ? { mfa_verified: verified, mfa_verified_by: user.id, mfa_verified_at: now, mfa_review_note: review_note }
      : {
          passkey_verified: verified,
          passkey_verified_by: user.id,
          passkey_verified_at: now,
          passkey_review_note: review_note,
        };

  const { error } = await admin
    .from("credential_status")
    .upsert({ profile_id, updated_at: now, ...patch }, { onConflict: "profile_id" });
  if (error) {
    console.error("[verify-proof] upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await bellNotify([profile_id], user.id, "password_reset_reviewed");
  return NextResponse.json({ ok: true });
}
