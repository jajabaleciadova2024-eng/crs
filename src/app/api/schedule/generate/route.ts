import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth";
import { generateDailyAssignments, allocateWindows, type StationQuota, type DailyImmunePlacement } from "@/lib/schedule";
import { assignDayBreaks, type BreakSlot, type SeatedWindow, type BreakStation } from "@/lib/breakTime";
import { compareWindowLabels } from "@/lib/windowOrder";
import { notifySchedulePublished } from "@/lib/notify";
import { bellNotify, allActiveMemberIds } from "@/lib/bellNotify";
import { todayInManila, startOfWorkWeek, addDays, formatWeekRange, workDatesForWeek } from "@/lib/scheduleDates";

// Generates a schedule for the Team-Leader-chosen week (the modal's date
// picker, defaulted to the next open week but editable) — or, if no week
// was submitted (older/direct callers), falls back to auto-picking the
// earliest not-yet-scheduled week starting from next week. Either way,
// never the current week by default, and never silently overwrites an
// already-scheduled week. Publishes a notification email afterward.
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

    // Optional per-station headcount/tenure quotas and immune placements
    // from the Generate modal — see src/lib/schedule.ts for how these
    // change the assignment algorithm. Omitted (or empty body) falls back
    // to a default one-per-station quota (see below) so a hypothetical
    // non-modal caller still gets a sane daily result instead of an error.
    // Immune placements are now day-scoped: each entry names the specific
    // dates (a subset of that week's 5 workdays) the person is pinned to
    // that station for — see generateDailyAssignments.
    const body = await request.json().catch(() => ({}));
    const quotas: StationQuota[] | undefined = Array.isArray(body?.quotas) && body.quotas.length > 0 ? body.quotas : undefined;
    const immunePlacements: DailyImmunePlacement[] = Array.isArray(body?.immune_placements) ? body.immune_placements : [];
    const requestedWeekStart: string | undefined = typeof body?.week_start_date === "string" ? body.week_start_date : undefined;

    let targetWeekStart: string;
    if (requestedWeekStart) {
      // Team Leader picked a specific week in the modal — normalize
      // whatever date they picked to that week's Monday (same rule the
      // modal itself already applies client-side, re-applied here since
      // the client can't be trusted) and use it exactly, rather than
      // silently substituting a different week. If that week is already
      // scheduled, fail with a clear reason instead of overwriting it or
      // quietly picking a different one.
      targetWeekStart = startOfWorkWeek(requestedWeekStart);
      const { data: existing, error: existingError } = await supabase
        .from("schedule_weeks")
        .select("id")
        .eq("week_start_date", targetWeekStart)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: `Couldn't check the week of ${targetWeekStart}: ${existingError.message}` }, { status: 500 });
      }
      if (existing) {
        return NextResponse.json(
          { error: `A schedule for the week of ${formatWeekRange(targetWeekStart)} already exists. Pick a different week, or clear that one first.` },
          { status: 400 }
        );
      }
    } else {
      // No week specified (older/direct callers) — fall back to
      // auto-picking: start counting from the week AFTER today's current
      // week (never the current week itself), walking forward past any
      // already-scheduled weeks.
      const { data: orgSettings, error: orgError } = await supabase.from("org_settings").select("schedule_cadence").limit(1).maybeSingle();
      if (orgError) {
        return NextResponse.json({ error: `Couldn't load organization settings: ${orgError.message}` }, { status: 500 });
      }
      const cadenceDays = orgSettings?.schedule_cadence === "biweekly" ? 14 : 7;
      const thisWeekStart = startOfWorkWeek(todayInManila());
      targetWeekStart = addDays(thisWeekStart, cadenceDays);
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
    }

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

    // Every work day (Mon-Fri) in the target week — the algorithm now
    // generates once per day instead of once for the whole week.
    const workDates = workDatesForWeek(targetWeekStart);

    // Required step (Team Leader's explicit rule): when using the quota
    // modal, EVERY currently-immune, active, non-Team-Leader profile must be
    // explicitly placed at a station, for at least one day, before
    // generating — no automatic carryover from last week. Generation is
    // blocked until all of them are accounted for. Each placement's `dates`
    // must also be a non-empty subset of this week's actual workdays.
    if (quotas) {
      const immuneRequired = eligiblePool.filter((p) => p.is_immune);
      const placedIds = new Set(immunePlacements.filter((p) => p.dates?.length > 0).map((p) => p.associate_id));
      const missing = immuneRequired.filter((p) => !placedIds.has(p.id));
      if (missing.length > 0) {
        const names = missing.map((p) => `${p.first_name} ${p.last_name}`).join(", ");
        return NextResponse.json(
          { error: `Place every immune member at a station, on at least one day, before generating. Still missing: ${names}` },
          { status: 400 }
        );
      }
      const invalidDates = immunePlacements.filter((p) => (p.dates ?? []).some((d) => !workDates.includes(d)));
      if (invalidDates.length > 0) {
        return NextResponse.json(
          { error: "One or more immune placements named a day outside this week — refresh and try again." },
          { status: 400 }
        );
      }
    }

    // If no quotas were submitted (legacy/direct caller — the modal always
    // sends them), fall back to one seat per station per day, no tenure
    // preference, so this route never regresses a hypothetical non-modal
    // caller.
    const effectiveQuotas: StationQuota[] =
      quotas ?? workstations.map((w) => ({ workstation_id: w.id, headcount: w.headcount, tenured: 0, newHire: w.headcount }));

    const newAssignments = generateDailyAssignments(workDates, workstations, eligiblePool, effectiveQuotas, immunePlacements, Math.random);

    // Safety net: every explicit immune placement the Team Leader made in
    // the modal must show up in the actual result at that exact station on
    // every one of its selected dates — if a station's fixed headcount
    // can't fit everyone placed there on some day (e.g. two immune members
    // sent to a 1-seat station), generateAssignments silently drops
    // whichever one doesn't fit and the algorithm's normal fallback fill
    // reseats them somewhere else entirely, with no indication anything
    // went wrong. That "silently placed somewhere I didn't choose"
    // behavior is exactly what was reported — refuse to generate at all
    // instead, with a clear reason, rather than ever silently disregard a
    // placement the Team Leader explicitly made.
    if (immunePlacements.length > 0) {
      const seated = new Set(newAssignments.map((a) => `${a.associate_id}::${a.workstation_id}::${a.assignment_date}`));
      const unhonored = immunePlacements.flatMap((p) =>
        (p.dates ?? [])
          .filter((d) => !seated.has(`${p.associate_id}::${p.workstation_id}::${d}`))
          .map((d) => ({ ...p, date: d }))
      );
      if (unhonored.length > 0) {
        const profileById = new Map((allActive ?? []).map((p) => [p.id, p]));
        const workstationById = new Map(workstations.map((w) => [w.id, w]));
        const details = unhonored
          .map((p) => {
            const person = profileById.get(p.associate_id);
            const station = workstationById.get(p.workstation_id);
            const name = person ? `${person.first_name} ${person.last_name}` : "Someone";
            return `${name} → ${station?.name ?? "that station"} on ${p.date} (headcount ${station?.headcount ?? "?"})`;
          })
          .join("; ");
        return NextResponse.json(
          {
            error: `Couldn't honor every immune placement — the target station's fixed headcount is full that day: ${details}. Increase that station's headcount on Workstations, or place fewer immune members there, then try again.`,
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

    // Hand each seated person a specific physical window within their
    // station, so the schedule can show "W12" and breaks have something to
    // attach to.
    const { data: allWindows } = await supabase
      .from("workstation_windows")
      .select("id, workstation_id, label")
      .eq("is_active", true);
    const withWindows = allocateWindows(newAssignments, allWindows ?? [], compareWindowLabels);

    const { error: assignError } = await supabase.from("assignments").insert(
      withWindows.map((a) => ({
        schedule_week_id: newWeek.id,
        workstation_id: a.workstation_id,
        associate_id: a.associate_id,
        assignment_date: a.assignment_date,
        window_id: a.window_id,
      }))
    );
    if (assignError) {
      // The schedule_weeks row was already created above — roll it back
      // rather than leaving an empty, orphaned week behind if the
      // assignments insert fails partway through.
      await supabase.from("schedule_weeks").delete().eq("id", newWeek.id);
      return NextResponse.json({ error: `Couldn't save the assignments: ${assignError.message}` }, { status: 400 });
    }

    // --- Break times, generated in the SAME action as the schedule ---
    // The two must never drift apart: a week always has both, or neither.
    // Clearing the week cascades the breaks away with it.
    const [{ data: breakStations }, { data: breakProfiles }] = await Promise.all([
      supabase.from("workstations").select("id, name, man_priority, can_be_pulled, is_reliever, min_manned"),
      supabase.from("profiles").select("id, is_break_immune"),
    ]);
    const breakImmuneIds = new Set(
      (breakProfiles ?? []).filter((p: { is_break_immune: boolean }) => p.is_break_immune).map((p: { id: string }) => p.id),
    );
    const windowById = new Map((allWindows ?? []).map((w: { id: string; label: string }) => [w.id, w.label]));

    const breakRows: {
      schedule_week_id: string;
      assignment_date: string;
      window_id: string;
      associate_id: string;
      break_slot: BreakSlot;
      reliever_associate_id: string | null;
    }[] = [];

    for (const date of workDatesForWeek(targetWeekStart)) {
      const seated: SeatedWindow[] = withWindows
        .filter((a) => a.assignment_date === date && a.window_id)
        .map((a) => ({
          window_id: a.window_id as string,
          window_label: windowById.get(a.window_id as string) ?? "",
          workstation_id: a.workstation_id,
          associate_id: a.associate_id,
          is_break_immune: breakImmuneIds.has(a.associate_id),
          locked_slot: null,
        }));
      if (seated.length === 0) continue;

      const dayBreaks = assignDayBreaks(seated, (breakStations ?? []) as BreakStation[]);
      for (const b of dayBreaks) {
        breakRows.push({
          schedule_week_id: newWeek.id,
          assignment_date: date,
          window_id: b.window_id,
          associate_id: b.associate_id,
          break_slot: b.break_slot,
          reliever_associate_id: b.reliever_associate_id,
        });
      }
    }

    if (breakRows.length > 0) {
      const { error: breakError } = await supabase.from("break_assignments").insert(breakRows);
      // A break failure doesn't roll back the schedule — the week is still
      // valid and usable, and breaks can be regenerated. Logged loudly.
      if (breakError) console.error("[schedule/generate] break insert failed:", breakError);
    }

    await notifySchedulePublished(targetWeekStart);
    await bellNotify(await allActiveMemberIds(), user.id, "schedule_published");

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
