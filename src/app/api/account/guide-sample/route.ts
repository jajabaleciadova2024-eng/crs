import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "password-proofs";
const VALID_STEPS = ["mfa", "passkey", "reset"] as const;
type Step = (typeof VALID_STEPS)[number];
const MAX_BYTES = 10 * 1024 * 1024;

function guidePath(step: Step) {
  return `guides/${step}-sample`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can upload guide samples." }, { status: 403 });
  }

  const form = await request.formData();
  const step = form.get("step") as Step;
  const file = form.get("file");
  if (!VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: "step must be 'mfa', 'passkey', or 'reset'." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach an image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (10MB max)." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(guidePath(step), buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) {
    console.error("[guide-sample] upload failed:", error);
    return NextResponse.json({ error: "Couldn't upload." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const step = url.searchParams.get("step") as Step;
  if (!VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: "step must be 'mfa', 'passkey', or 'reset'." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(guidePath(step), 120);
  if (error || !data) return NextResponse.json({ error: "No sample uploaded yet." }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can remove guide samples." }, { status: 403 });
  }

  const url = new URL(request.url);
  const step = url.searchParams.get("step") as Step;
  if (!VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: "step must be 'mfa', 'passkey', or 'reset'." }, { status: 400 });
  }

  await admin.storage.from(BUCKET).remove([guidePath(step)]);
  return NextResponse.json({ ok: true });
}
