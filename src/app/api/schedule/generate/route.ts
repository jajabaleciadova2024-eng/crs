import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";
import { generateAssignments, type StationQuota, type ImmunePlacement } from "@/lib/schedule";
import { notifySchedulePublished } from "@/lib/notify";
import { todayInManila, startOfWorkWeek, addDays } from "@/lib/scheduleDates";

// Always generates the upcoming week's schedule — never the current one,
// even if the current week has no schedule yet. "Generating this week"
// (i.e. today, sometime during the current work week) only ever produces
// NEXT week's schedule, by definition; if several weeks are already
// scheduled ahead, it continues from whichever is the latest one on
// record (spaced by org_settings.schedule_cadence). Publishes a
// notification email afterward.
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
      return NextResponse.json({ error: "Only the Team Leader can generate a schedule." }, { status: 403 });
    }

    const { data: orgSettings, error: orgError } = await supabase.from("org_settings").select("schedule_cadence").limit(1).maybeSingle();
    if (orgError) {
      return NextResponse.json({ error: `Couldn't load organization settings: ${orgError.message}` }, { status: 500 });
    }
    const cadenceDays = orgSettings?.schedule_cadence === "biweekly" ? 14 : 7;

    const { data: latestWeek, error: latestWeekError } = await supabase
      .from("schedule_weeks")
      .select("id, week_start_date")
      .order("week_start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestWeekError) {
      return NextResponse.json({ error: `Couldn't check existing schedules: ${latestWeekError.message}` }, { status: 500 });
    }

    // Always start counting from the week AFTER today's current week — never
    // the current week itself, no matter what. Walking forward past any
    // already-scheduled weeks (instead of jumping straight to
    // latestWeek + cadence) means it's never earlier than next week, no
    // matter what state schedule_weeks is in, and still correctly
    // continues past however many weeks are already generated ahead.
    const thisWeekStart = startOfWorkWeek(todayInManila());
    let targetWeekStart = addDays(thisWeekStart, cadenceDays);
    for (let guard = 0; guard < 52; guard++) {
      const { data: existing, error: existingError } = await supabase
        .from("schedule_weeks")
        .select("id")
        .eq("week_start_date", targetWeekStart)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: `Couldn't check the week of ${targetWeekStart}: ${existingError.message}` }, { status: 500 });
      }
      if (!existing) break;
      targetWeekStart = addDays(targetWeekStart, cadenceDays);
    }

    // Optional per-station headcount/tenure quotas from the "Generate next
    // week" modal — see src/lib/schedule.ts for how these change the
    // assignment algorithm. Omitted (or empty body) falls back to the
    // original one-per-station, no-tenure-preference behavior.
    const body = await request.json().catch(() => ({}));
    const quotas: StationQuota[] | undefined = Array.isArray(body?.quotas) && body.quotas.length > 0 ? body.quotas : undefined;
    const immunePlacements: ImmunePlacement[] | undefined = Array.isArray(body?.immune_placements) ? body.immune_placements : undefined;

    const { data: workstations, error: workstationsError } = await supabase
      .from("workstations")
      .select("id, name, headcount")
      .eq("is_active", true);
    if (workstationsError) {
      return NextResponse.json({ error: `Couldn't load workstations: ${workstationsError.message}` }, { status: 500 });
    }
    if (!workstations || workstations.length === 0) {
      return NextResponse.json({ error: "No active workstations found — add one on the Workstations page first." }, { status: 400 });
    }

    // Team Leader/OIC/associates are all eligible to be seated — Team Leader
    // doesn't rotate through stations, so excluded from the pool entirely.
    // Tenure targeting still only pulls from role="associate" (enforced in
    // src/lib/schedule.ts), but OIC is eligible for headcount/fallback
    // seating per the Team Leader's explicit instruction.
    const { data: allActive, error: activeError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, role, is_immune, tenure_group")
      .eq("is_active", true);
    if (activeError) {
      return NextResponse.json({ error: `Couldn't load active members: ${activeError.message}` }, { status: 500 });
    }
    const eligiblePool = (allActive ?? []).filter((p) => p.role !== "team_leader");
    if (eligiblePool.length === 0) {
      return NextResponse.json(
        { error: "No active OIC/associates found to assign — check Team & Roles for active, non-Team-Leader members." },
        { status: 400 }
      );
    }

    // Required step (Team Leader's explicit rule): when using the quota
    // modal, EVERY currently-immune, active, non-Team-Leader profile must be
    // explicitly placed at a station before generating — no automatic
    // carryover from last week. Generation is blocked until all of them are
    // accounted for.
    if (quotas) {
      const immuneRequired = eligiblePool.filter((p) => p.is_immune);
      const placedIds = new Set((immunePlacements ?? []).map((p) => p.associate_id));
      const missing = immuneRequired.filter((p) => !placedIds.has(p.id));
      if (missing.length > 0) {
        const names = missing.map((p) => `${p.first_name} ${p.last_name}`).join(", ");
        return NextResponse.json(
          { error: `Place every immune member at a station before generating. Still missing: ${names}` },
          { status: 400 }
        );
      }
    }

    const { data: previousAssignments, error: previousError } = latestWeek
      ? await supabase.from("assignments").select("workstation_id, associate_id").eq("schedule_week_id", latestWeek.id)
      : { data: [], error: null };
    if (previousError) {
      return NextResponse.json({ error: `Couldn't load the previous week's assignments: ${previousError.message}` }, { status: 500 });
    }

    const newAssignments = generateAssignments(
      workstations,
      eligiblePool,
      previousAssignments ?? [],
      Math.random,
      quotas,
      immunePlacements
    );

    // Safety net: every explicit immune placement the Team Leader made in
    // the modal must show up in the actual result at that exact station —
    // if a station's fixed headcount can't fit everyone placed there (e.g.
    // two immune members sent to a 1-seat station), generateAssignments
    // silently drops whichever one doesn't fit and the algorithm's normal
    // fallback fill reseats them somewhere else entirely, with no
    // indication anything went wrong. That "silently placed somewhere I
    // didn't choose" behavior is exactly what was reported — refuse to
    // generate at all instead, with a clear reason, rather than ever
    // silently disregard a placement the Team Leader explicitly made.
    if (immunePlacements && immunePlacements.length > 0) {
      const seated = new Set(newAssignments.map((a) => `${a.associate_id}::${a.workstation_id}`));
      const unhonored = immunePlacements.filter((p) => !seated.has(`${p.associate_id}::${p.workstation_id}`));
      if (unhonored.length > 0) {
        const profileById = new Map((allActive ?? []).map((p) => [p.id, p]));
        const workstationById = new Map(workstations.map((w) => [w.id, w]));
        const details = unhonored
          .map((p) => {
            const person = profileById.get(p.associate_id);
            const station = workstationById.get(p.workstation_id);
            const name = person ? `${person.first_name} ${person.last_name}` : "Someone";
            return `${name} → ${station?.name ?? "that station"} (headcount ${station?.headcount ?? "?"})`;
          })
          .join("; ");
        return NextResponse.json(
          {
            error: `Couldn't honor every immune placement — the target station's fixed headcount is full: ${details}. Increase that station's headcount on Workstations, or place fewer immune members there, then try again.`,
          },
          { status: 400 }
        );
      }
    }

    if (newAssignments.length === 0) {
      // Shouldn't normally happen (workstations and eligiblePool are both
      // confirmed non-empty above), but if the pure algorithm somehow still
      // produces nothing, say so explicitly instead of silently creating an
      // empty schedule week that just looks like "nothing happened".
      return NextResponse.json(
        { error: "Nothing could be assigned — check that your Tenured/New Hire counts and station headcounts actually add up to real people." },
        { status: 400 }
      );
    }

    const { data: newWeek, error: weekError } = await supabase
      .from("schedule_weeks")
      .insert({ week_start_date: targetWeekStart, generated_by: user.id })
      .select("id")
      .single();
    if (weekError || !newWeek) {
      return NextResponse.json({ error: weekError?.message ?? "Couldn't create the new schedule week." }, { status: 400 });
    }

    const { error: assignError } = await supabase.from("assignments").insert(
      newAssignments.map((a) => ({
        schedule_week_id: newWeek.id,
        workstation_id: a.workstation_id,
        associate_id: a.associate_id,
      }))
    );
    if (assignError) {
      // The schedule_weeks row was already created above — roll it back
      // rather than leaving an empty, orphaned week behind if the
      // assignments insert fails partway through.
      await supabase.from("schedule_weeks").delete().eq("id", newWeek.id);
      return NextResponse.json({ error: `Couldn't save the assignments: ${assignError.message}` }, { status: 400 });
    }

    await notifySchedulePublished(targetWeekStart);

    // Same reasoning as /api/schedule/clear: router.refresh() from the
    // calling client only invalidates the Weekly Schedule route it was
    // called from, not the Dashboard's separately-cached "This week's
    // assignments" panel (a different route entirely) — and it's purely
    // local to that one browser tab/session besides. revalidatePath makes
    // both routes fetch fresh data on their next load, for every viewer,
    // not just whoever clicked Generate.
    revalidatePath("/");
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, week_start_date: targetWeekStart, assignments: newAssignments.length });
  } catch (err) {
    // Last-resort net so an unexpected exception (a bug, a bad response
    // shape, anything) always comes back as a visible error the Team
    // Leader can report, instead of a silent failure or an opaque 500
    // with no explanation.
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: `Unexpected error while generating: ${message}` }, { status: 500 });
  }
}
