import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";
import { generateAssignments, type StationQuota, type ImmunePlacement } from "@/lib/schedule";
import { notifySchedulePublished } from "@/lib/notify";
import { todayInManila, startOfWorkWeek, addDays } from "@/lib/scheduleDates";

// Generates the earliest not-yet-scheduled week starting from the CURRENT
// week — fills the current week if it has no schedule yet, otherwise the
// next one after it (spaced by org_settings.schedule_cadence), continuing
// forward from whichever weeks are already scheduled. Publishes a
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

  // Walk forward from THIS week (not from whatever the latest row in the
  // table happens to be) until an unscheduled week is found. The previous
  // version computed `addDays(latestWeek.week_start_date, cadenceDays)`
  // directly — if the latest row on record was from a week further back
  // than one cadence period ago (a skipped week, or a stray old row left
  // over from testing/a data reset), that landed the "next" week
  // BEFORE today, on an already-elapsed week, or back on THIS week even
  // though it was labeled "next" — reported as "next week schedule
  // result is this week". Looping from today's actual current week
  // guarantees the target is never earlier than "this week", and still
  // correctly continues past however many weeks are already scheduled
  // ahead (the loop just keeps advancing past existing rows).
  const thisWeekStart = startOfWorkWeek(todayInManila());
  let targetWeekStart = thisWeekStart;
  for (let guard = 0; guard < 52; guard++) {
    const { data: existing } = await supabase
      .from("schedule_weeks")
      .select("id")
      .eq("week_start_date", targetWeekStart)
      .maybeSingle();
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

  const { data: workstations } = await supabase.from("workstations").select("id, name, headcount").eq("is_active", true);
  // Team Leader/OIC/associates are all eligible to be seated — Team Leader
  // doesn't rotate through stations, so excluded from the pool entirely.
  // Tenure targeting still only pulls from role="associate" (enforced in
  // src/lib/schedule.ts), but OIC is eligible for headcount/fallback
  // seating per the Team Leader's explicit instruction.
  const { data: allActive } = await supabase.from("profiles").select("id, first_name, last_name, role, is_immune, tenure_group").eq("is_active", true);
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
      const names = missing.map((p) => `${p.first_name} ${p.last_name}`).join(", ");
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
      const workstationById = new Map((workstations ?? []).map((w) => [w.id, w]));
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
