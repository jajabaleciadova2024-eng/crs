import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Seeds or corrects a member's last-reset date directly. Team Leader only.
//
// Needed to onboard this feature at all: everybody already has a live
// password with time on it, and without a baseline every member would read
// as "not set" — which blocks. Also the escape hatch for a mistyped date.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can set a baseline." }, { status: 403 });
  }

  const { profile_id, last_reset_at } = await request.json();
  if (!profile_id || !last_reset_at) {
    return NextResponse.json({ error: "profile_id and last_reset_at are required." }, { status: 400 });
  }
  const when = new Date(last_reset_at);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "That date isn't valid." }, { status: 400 });
  }
  if (when.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "The reset date can't be in the future." }, { status: 400 });
  }

  const { error } = await admin.from("credential_status").upsert(
    { profile_id, last_reset_at: when.toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "profile_id" },
  );
  if (error) {
    console.error("[account/baseline] upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
