import { NextResponse } from "next/server";
import { bellNotify } from "@/lib/bellNotify";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";
import { pickFreeWindow, syncBreakOccupant, clearBreakForWindow } from "@/lib/windowSync";

// Drag-and-drop counterpart to /api/schedule/reassign: dropping a person's
// card onto an EMPTY spot in a different station's column (same day) moves
// them there outright, no swap involved (nobody else's row changes) — as
// opposed to dropping directly onto another person's card, which is a swap
// and goes through /api/schedule/reassign instead (see AssignmentCard.tsx).
// Same-day only: this only ever changes `workstation_id`, never
// `assignment_date` — moving someone to a different DAY is a separate,
// unrelated concept this doesn't attempt.
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
      return NextResponse.json({ error: "Only the Team Leader can move an assignment." }, { status: 403 });
    }

    const { assignment_id, workstation_id } = await request.json();
    if (!assignment_id || !workstation_id) {
      return NextResponse.json({ error: "Missing assignment_id or workstation_id." }, { status: 400 });
    }

    const { data: current, error: currentError } = await supabase
      .from("assignments")
      .select("id, schedule_week_id, workstation_id, assignment_date, associate_id, window_id")
      .eq("id", assignment_id)
      .single();
    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message ?? "That assignment no longer exists." }, { status: 404 });
    }

    if (workstation_id === current.workstation_id) {
      // Dropped back onto the same station — no-op.
      return NextResponse.json({ ok: true });
    }

    const { data: targetStation, error: targetError } = await supabase
      .from("workstations")
      .select("id, name, headcount")
      .eq("id", workstation_id)
      .single();
    if (targetError || !targetStation) {
      return NextResponse.json({ error: targetError?.message ?? "That station no longer exists." }, { status: 404 });
    }

    // Capacity check: this station's fixed headcount for THAT SAME DAY —
    // other days are irrelevant, a station can be full Monday and open
    // Tuesday.
    const { count: filled, error: countError } = await supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("schedule_week_id", current.schedule_week_id)
      .eq("workstation_id", workstation_id)
      .eq("assignment_date", current.assignment_date);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 400 });
    }
    if ((filled ?? 0) >= targetStation.headcount) {
      return NextResponse.json(
        { error: `${targetStation.name} is already full that day (${targetStation.headcount} seat${targetStation.headcount === 1 ? "" : "s"}) — drop onto one of them to swap instead.` },
        { status: 400 }
      );
    }

    // The window has to move with them: a CO window number is meaningless
    // once someone is sitting at Releasing Officer. Take a free window at the
    // destination, or null when that station has none to spare.
    const newWindowId = await pickFreeWindow(
      supabase,
      workstation_id,
      current.schedule_week_id,
      current.assignment_date,
      assignment_id,
    );

    const { error: updateError } = await supabase
      .from("assignments")
      .update({ workstation_id, window_id: newWindowId })
      .eq("id", assignment_id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Their old window is now empty — drop its break so it stops listing
    // someone who has moved away. Their break at the new window (if that
    // window has one) becomes theirs.
    await clearBreakForWindow(supabase, current.assignment_date, current.window_id);
    await syncBreakOccupant(supabase, current.assignment_date, newWindowId, current.associate_id);

    revalidatePath("/");
    revalidatePath("/schedule");

    // The person who moved needs to know: turning up at the old window

    // is exactly what happens otherwise.

    if (current?.associate_id) await bellNotify([current.associate_id], user.id, "schedule_changed");


    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Unexpected error while moving: ${message}` }, { status: 500 });
  }
}
