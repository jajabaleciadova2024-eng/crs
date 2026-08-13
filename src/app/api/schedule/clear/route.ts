import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";

// Deletes a generated schedule week entirely (assignments cascade via FK),
// so the Weekly Schedule page goes back to "no schedule generated yet" for
// that week. Team Leader only, same authority as generating one.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profileError) {
      return NextResponse.json({ error: `Couldn't load your profile: ${profileError.message}` }, { status: 500 });
    }
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

    // The caller (Weekly Schedule) already refreshes itself via
    // router.refresh() client-side, but that only invalidates the CURRENT
    // route's client-side Router Cache entry, and only for that one
    // browser tab/session — the Dashboard's "This week's assignments"
    // panel (a completely different route), and any OTHER tab/session
    // looking at either page, keep showing their own last-cached snapshot
    // (still with the now-deleted assignments) until something explicitly
    // tells Next.js those routes are stale too. That mismatch was the bug:
    // clearing looked like it worked on Weekly Schedule but the Dashboard
    // didn't budge.
    revalidatePath("/");
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Unexpected error while clearing: ${message}` }, { status: 500 });
  }
}
