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
      return NextResponse.json({ error: "Only the Team Leader can reassign a station." }, { status: 403 });
    }

    // associate_id is intentionally allowed to be "" here (the dropdown's
    // "— Unassigned —" option) — only assignment_id is required. Distinct
    // from it being missing entirely (undefined), which is still rejected.
    const { assignment_id, associate_id } = await request.json();
    if (!assignment_id || typeof associate_id !== "string") {
      return NextResponse.json({ error: "Missing assignment_id or associate_id." }, { status: 400 });
    }

    const { data: current, error: currentError } = await supabase
      .from("assignments")
      .select("id, schedule_week_id, workstation_id, associate_id")
      .eq("id", assignment_id)
      .single();
    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message ?? "That assignment no longer exists." }, { status: 404 });
    }

    // "— Unassigned —" picked: just remove this station's assignment for
    // the week rather than pointing it at anyone.
    if (associate_id === "") {
      const { error } = await supabase.from("assignments").delete().eq("id", assignment_id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      revalidatePath("/");
      revalidatePath("/schedule");
      return NextResponse.json({ ok: true });
    }

    if (associate_id === current.associate_id) {
      // No-op — already assigned there.
      return NextResponse.json({ ok: true });
    }

    // assignments has a unique (schedule_week_id, associate_id) constraint —
    // one person can't hold two stations the same week. If the picked
    // person already has a different station this week, a plain update
    // would violate that constraint. Swap the two instead: they take this
    // station, and whoever was here takes theirs.
    const { data: collision, error: collisionError } = await supabase
      .from("assignments")
      .select("id, workstation_id")
      .eq("schedule_week_id", current.schedule_week_id)
      .eq("associate_id", associate_id)
      .neq("id", assignment_id)
      .maybeSingle();
    if (collisionError) {
      return NextResponse.json({ error: collisionError.message }, { status: 400 });
    }

    if (!collision) {
      const { error } = await supabase.from("assignments").update({ associate_id }).eq("id", assignment_id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      revalidatePath("/");
      revalidatePath("/schedule");
      return NextResponse.json({ ok: true });
    }

    // Delete both rows first, then reinsert with associate_ids swapped —
    // updating in place would trip the unique constraint mid-statement no
    // matter which row goes first, since both target associate_ids are
    // already taken by the other row until both are gone.
    const { error: deleteError } = await supabase.from("assignments").delete().in("id", [assignment_id, collision.id]);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
    const { error: insertError } = await supabase.from("assignments").insert([
      { schedule_week_id: current.schedule_week_id, workstation_id: current.workstation_id, associate_id },
      { schedule_week_id: current.schedule_week_id, workstation_id: collision.workstation_id, associate_id: current.associate_id },
    ]);
    if (insertError) {
      // Best-effort restore of the two rows just deleted, so a failed swap
      // doesn't leave both stations empty instead of merely unswapped.
      await supabase.from("assignments").insert([
        { schedule_week_id: current.schedule_week_id, workstation_id: current.workstation_id, associate_id: current.associate_id },
        { schedule_week_id: current.schedule_week_id, workstation_id: collision.workstation_id, associate_id },
      ]);
      return NextResponse.json({ error: `Couldn't complete the swap: ${insertError.message}` }, { status: 400 });
    }

    revalidatePath("/");
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Unexpected error while reassigning: ${message}` }, { status: 500 });
  }
}
