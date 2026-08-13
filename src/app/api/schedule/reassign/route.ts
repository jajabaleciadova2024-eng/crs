import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";

// Swaps who's assigned to a station (ReassignForm on Weekly Schedule).
// Moved from a direct client-side Supabase call to a route so it can
// revalidatePath the Dashboard too — same fix as /api/schedule/clear and
// /api/schedule/generate: a plain client-side update + router.refresh()
// only ever un-staled the Weekly Schedule page itself (and only for the
// browser tab that made the change), leaving the Dashboard's separately-
// cached "This week's assignments" panel showing whoever used to be
// there.
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
    return NextResponse.json({ error: "Only the Team Leader can reassign a station." }, { status: 403 });
  }

  const { assignment_id, associate_id } = await request.json();
  if (!assignment_id || !associate_id) {
    return NextResponse.json({ error: "Missing assignment_id or associate_id." }, { status: 400 });
  }

  const { error } = await supabase.from("assignments").update({ associate_id }).eq("id", assignment_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/");
  revalidatePath("/schedule");

  return NextResponse.json({ ok: true });
}
