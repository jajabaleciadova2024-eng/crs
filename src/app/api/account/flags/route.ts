import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// MFA / passkey compliance flags. A member marks their own; the Team Leader
// can correct anyone's. Both are mandatory on the platform — MFA first,
// passkey second — so they are tracked rather than assumed.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isTL = caller?.role === "team_leader";

  const { profile_id, mfa_configured, passkey_configured } = await request.json();
  const target = profile_id ?? user.id;
  if (target !== user.id && !isTL) {
    return NextResponse.json({ error: "You can only update your own account." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { profile_id: target, updated_at: now };
  if (typeof mfa_configured === "boolean") {
    patch.mfa_configured = mfa_configured;
    patch.mfa_confirmed_at = mfa_configured ? now : null;
  }
  if (typeof passkey_configured === "boolean") {
    patch.passkey_configured = passkey_configured;
    patch.passkey_confirmed_at = passkey_configured ? now : null;
  }

  const { error } = await admin.from("credential_status").upsert(patch, { onConflict: "profile_id" });
  if (error) {
    console.error("[account/flags] upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
