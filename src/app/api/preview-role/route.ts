import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_ROLE_COOKIE } from "@/lib/auth";

// Sets/clears the preview-mode cookie — see requireProfileWithPreview in
// src/lib/auth.ts for how it's applied. Restricted to real Team Leaders
// (checked against the DB role directly, not any existing preview state).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can use preview mode." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { role } = body ?? {};
  const cookieStore = await cookies();

  if (!role || role === "team_leader") {
    cookieStore.delete(PREVIEW_ROLE_COOKIE);
  } else if (role === "oic" || role === "associate") {
    cookieStore.set(PREVIEW_ROLE_COOKIE, role, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 8, // 8h safety expiry so a forgotten preview doesn't linger forever
    });
  } else {
    return NextResponse.json({ error: "Invalid preview role." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
