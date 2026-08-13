import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";
import { generateAssignments, type StationQuota, type ImmunePlacement } from "@/lib/schedule";
import { notifySchedulePublished } from "@/lib/notify";
import { todayInManila, startOfWorkWeek, addDays } from "@/lib/scheduleDates";

// Generates the next not-yet-scheduled week: fills the current week if it
// has no schedule yet, otherwise generates the week after the latest one on
// record (spaced by org_settings.schedule_cadence). Publishes a
// notification email afterward.
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
    return NextResponse.json({ error: "Only the Team Leader can generate a schedule." }, { status: 403 });
  }

  const { data: orgSettings } = await supabase.from("org_settings").select("schedule_cadence").limit(1).maybeSingle();
  const cadenceDays = orgSettings?.schedule_cadence === "biweekly" ? 14 : 7;

  const { data: latestWeek } = await supabase
    .from("schedule_weeks")
    .select("id, week_start_date")
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const thisWeekStart = startOfWorkWeek(todayInManila());
  const targetWeekStart = latestWeek ? addDays(latestWeek.week_start_date, cadenceDays) : thisWeekStart;

  const { data: existingTarget } = await supabase
    .from("schedule_weeks")
    .select("id")
    .eq("week_start_date", targetWeekStart)
    .maybeSingle();
  if (existingTarget) {
    return NextResponse.json({ error: `A schedule for the week of ${targetWeekStart} already exists.` }, { status: 400 });
  }

  // Optional per-station headcount/tenure quotas from the "Generate next
  // week" modal — see src/lib/schedule.ts for how these change the
  // assignment algorithm. Omitted (or empty body) falls back to the
  // original one-per-station, no-tenure-preference behavior.
  const body = await request.json().catch(() => ({}));
  const quotas: StationQuota[] | undefined = Array.isArray(body?.quotas) && body.quotas.length > 0 ? body.quotas : undefined;
  const immunePlacements: ImmunePlacement[] | undefined = Array.isArray(body?.immune_placements) ? body.immune_placements : undefined;

  const { data: workstations } = await supabase.from("workstations").select("id").eq("is_active", true);
  // Team Leader/OIC/associates are all eligible to be seated — Team Leader
  // doesn't rotate through stations, so excluded from the pool entirely.
  // Tenure targeting still only pulls from role="associate" (enforced in
  // src/lib/schedule.ts), but OIC is eligible for headcount/fallback
  // seating per the Team Leader's explicit instruction.
  const { data: allActive } = await supabase.from("profiles").select("id, role, is_immune, tenure_group").eq("is_active", true);
  const eligiblePool = (allActive ?? []).filter((p) => p.role !== "team_leader");

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
      const { data: missingProfiles } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .in(
          "id",
          missing.map((m) => m.id)
        );
      const names = (missingProfiles ?? []).map((p) => `${p.first_name} ${p.last_name}`).join(", ");
      return NextResponse.json(
        { error: `Place every immune member at a station before generating. Still missing: ${names}` },
        { status: 400 }
      );
    }
  }

  const { data: previousAssignments } = latestWeek
    ? await supabase.from("assignments").select("workstation_id, associate_id").eq("schedule_week_id", latestWeek.id)
    : { data: [] };

  const newAssignments = generateAssignments(
    workstations ?? [],
    eligiblePool,
    previousAssignments ?? [],
    Math.random,
    quotas,
    immunePlacements
  );

  const { data: newWeek, error: weekError } = await supabase
    .from("schedule_weeks")
    .insert({ week_start_date: targetWeekStart, generated_by: user.id })
    .select("id")
    .single();
  if (weekError || !newWeek) {
    return NextResponse.json({ error: weekError?.message ?? "Couldn't create the new schedule week." }, { status: 400 });
  }

  if (newAssignments.length > 0) {
    const { error: assignError } = await supabase.from("assignments").insert(
      newAssignments.map((a) => ({
        schedule_week_id: newWeek.id,
        workstation_id: a.workstation_id,
        associate_id: a.associate_id,
      }))
    );
    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 400 });
    }
  }

  await notifySchedulePublished(targetWeekStart);

  return NextResponse.json({ ok: true, week_start_date: targetWeekStart, assignments: newAssignments.length });
}
