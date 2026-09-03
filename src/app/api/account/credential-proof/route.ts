import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadResetProof, getResetProofUrl, deleteResetProof } from "@/lib/credentialStorage";

const MAX_BYTES = 10 * 1024 * 1024;
const KINDS = ["mfa", "passkey"] as const;
type Kind = (typeof KINDS)[number];

// POST — upload the screenshot proving MFA (mandatory) or the passkey
// (optional) is configured. Uploading is what marks it configured: a
// checkbox anyone can tick proves nothing, and MFA has to be evidenced
// because it gates the whole reset flow.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const kind = form.get("kind") as Kind;
  const file = form.get("proof");
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be 'mfa' or 'passkey'." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a screenshot." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Screenshot is too large (10MB max)." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Proof must be an image." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${kind}-${Date.now()}-${file.name}`;
  const uploaded = await uploadResetProof(path, file.type || "image/png", buffer);
  if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  const now = new Date().toISOString();
  const patch =
    kind === "mfa"
      ? { mfa_proof_path: path, mfa_configured: true, mfa_confirmed_at: now }
      : { passkey_proof_path: path, passkey_configured: true, passkey_confirmed_at: now };

  const admin = createAdminClient();
  const { error } = await admin
    .from("credential_status")
    .upsert({ profile_id: user.id, updated_at: now, ...patch }, { onConflict: "profile_id" });
  if (error) {
    console.error("[credential-proof] upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// GET — short-lived signed URL for one of those screenshots. The bucket has
// no storage policies, so this route is the access check: Team Leader, or
// the member it belongs to.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id") ?? user.id;
  const kind = url.searchParams.get("kind") as Kind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be 'mfa' or 'passkey'." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader" && profileId !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { data: status } = await admin
    .from("credential_status")
    .select("mfa_proof_path, passkey_proof_path")
    .eq("profile_id", profileId)
    .maybeSingle();
  const path = kind === "mfa" ? status?.mfa_proof_path : status?.passkey_proof_path;
  if (!path) return NextResponse.json({ error: "No screenshot on file." }, { status: 404 });

  const signed = await getResetProofUrl(path);
  if (!signed) return NextResponse.json({ error: "Couldn't open the screenshot." }, { status: 500 });
  return NextResponse.json({ url: signed });
}

// DELETE — take a proof back off. A wrong screenshot has to be removable,
// not merely replaceable: the passkey one is optional, so "replace it with
// nothing" is a real thing a member needs to do.
//
// Removing the MFA proof also clears its configured flag, which re-blocks
// reporting a reset. That is correct rather than unfortunate — no evidence
// means no compliance, and the gate reads the same field either way.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profile_id") ?? user.id;
  const kind = url.searchParams.get("kind") as Kind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be 'mfa' or 'passkey'." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader" && profileId !== user.id) {
    return NextResponse.json({ error: "You can only remove your own." }, { status: 403 });
  }

  const { data: status } = await admin
    .from("credential_status")
    .select("mfa_proof_path, passkey_proof_path")
    .eq("profile_id", profileId)
    .maybeSingle();
  const path = kind === "mfa" ? status?.mfa_proof_path : status?.passkey_proof_path;
  if (path) await deleteResetProof(path);

  const patch =
    kind === "mfa"
      ? { mfa_proof_path: null, mfa_configured: false, mfa_confirmed_at: null }
      : { passkey_proof_path: null, passkey_configured: false, passkey_confirmed_at: null };

  const { error } = await admin
    .from("credential_status")
    .upsert({ profile_id: profileId, updated_at: new Date().toISOString(), ...patch }, { onConflict: "profile_id" });
  if (error) {
    console.error("[credential-proof] delete failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
