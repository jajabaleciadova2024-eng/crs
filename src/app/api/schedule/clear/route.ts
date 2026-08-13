import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";

// Deletes a generated schedule week entirely (assignments cascade via FK),
// so the Weekly Schedule page goes back to "no schedule generated yet" for
// that week. Team Leader only, same authority as generating one.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !canManageOperations(profile.role)) {
    return NextResponse.json({ error: "Only the Team Leader can clear a schedule." }, { status: 403 });
  }

  const { schedule_week_id } = await request.json();
  if (!schedule_week_id) {
    return NextResponse.json({ error: "Missing schedule_week_id." }, { status: 400 });
  }

  const { error } = await supabase.from("schedule_weeks").delete().eq("id", schedule_week_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
