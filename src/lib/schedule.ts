// Pure assignment logic for the weekly auto-shuffle, kept dependency-free
// (no Supabase imports) so it's directly unit-testable.
//
// Three modes:
//  - No `quotas` given: legacy behavior — exactly one associate per station,
//    no tenure preference, immune associates carry over from whatever
//    station they held the previous week (via `previousAssignments`).
//    Unchanged from before — kept so existing callers/tests don't need to
//    know about quotas at all.
//  - `quotas` given, no `immunePlacements`: quota-based headcount + tenure
//    targeting (see below), but immune associates still carry over
//    automatically from `previousAssignments` like the legacy path.
//  - `quotas` AND `immunePlacements` given (this is what the app's
//    "Generate next week" modal actually sends): immune carryover is NOT
//    automatic — every currently-immune associate must be explicitly
//    placed at a station by the Team Leader in the modal first (enforced
//    as a hard requirement in the API route, not just here). Those
//    explicit placements are used instead of last week's assignments.
//
// In both quota modes: immune placements fill headcount first, then the
// tenured/new-hire pools fill each station's targets, then any still-open
// seats get filled from whoever's left regardless of tenure — better to
// have coverage than an empty seat if the quota under-specifies who's
// available.

export type ShuffleWorkstation = { id: string };
export type ShuffleAssociate = {
  id: string;
  is_immune: boolean;
  tenure_group?: "new_hire" | "tenured";
  // Role matters for the quota path: Team Leader doesn't rotate at all, so
  // never eligible for seating. OIC and associate are both eligible for
  // headcount/fallback seating AND the tenured/new-hire targeted pools
  // (Team Leader's explicit instruction: tenure/immune apply to OIC the
  // same as associates) — only an explicit "team_leader" role opts
  // someone out of the tenure-targeted pools.
  role?: "team_leader" | "oic" | "associate";
};
export type PreviousAssignment = { workstation_id: string; associate_id: string };
export type NewAssignment = { workstation_id: string; associate_id: string };
export type StationQuota = { workstation_id: string; headcount: number; tenured: number; newHire: number };
export type ImmunePlacement = { associate_id: string; workstation_id: string };

// Simple in-place Fisher-Yates shuffle. `rand` is injectable for deterministic
// tests; defaults to Math.random for real use.
function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateAssignments(
  workstations: ShuffleWorkstation[],
  associates: ShuffleAssociate[],
  previousAssignments: PreviousAssignment[],
  rand: () => number = Math.random,
  quotas?: StationQuota[],
  immunePlacements?: ImmunePlacement[]
): NewAssignment[] {
  const stationIds = new Set(workstations.map((w) => w.id));
  const associateIds = new Set(associates.map((a) => a.id));
  const previousStationByAssociate = new Map(previousAssignments.map((p) => [p.associate_id, p.workstation_id]));

  if (!quotas) {
    // ---- Legacy path: one seat per station, no tenure preference. ----
    const result: NewAssignment[] = [];
    const claimedStations = new Set<string>();

    for (const associate of associates) {
      if (!associate.is_immune) continue;
      const prevStation = previousStationByAssociate.get(associate.id);
      if (prevStation && stationIds.has(prevStation) && !claimedStations.has(prevStation)) {
        result.push({ workstation_id: prevStation, associate_id: associate.id });
        claimedStations.add(prevStation);
      }
    }

    const pinnedAssociateIds = new Set(result.map((r) => r.associate_id));
    const openStations = shuffle(
      workstations.filter((w) => !claimedStations.has(w.id)),
      rand
    );
    const freeAssociates = shuffle(
      associates.filter((a) => !pinnedAssociateIds.has(a.id) && associateIds.has(a.id)),
      rand
    );

    const pairCount = Math.min(openStations.length, freeAssociates.length);
    for (let i = 0; i < pairCount; i++) {
      result.push({ workstation_id: openStations[i].id, associate_id: freeAssociates[i].id });
    }

    return result;
  }

  // ---- Quota path: headcount + tenure/new-hire targets per station. ----
  const quotaByStation = new Map(quotas.map((q) => [q.workstation_id, q]));
  const result: NewAssignment[] = [];
  const assignedAssociateIds = new Set<string>();
  const stationFillCount = new Map<string, number>();

  function headcountFor(workstationId: string): number {
    return quotaByStation.get(workstationId)?.headcount ?? 1;
  }

  function seatImmune(associateId: string, workstationId: string) {
    if (!stationIds.has(workstationId) || !associateIds.has(associateId) || assignedAssociateIds.has(associateId)) return;
    const filled = stationFillCount.get(workstationId) ?? 0;
    if (filled >= headcountFor(workstationId)) return; // over quota — still not seated even though immune
    result.push({ workstation_id: workstationId, associate_id: associateId });
    assignedAssociateIds.add(associateId);
    stationFillCount.set(workstationId, filled + 1);
  }

  if (immunePlacements) {
    // Explicit placements from the Team Leader — no automatic carryover.
    for (const p of immunePlacements) seatImmune(p.associate_id, p.workstation_id);
  } else {
    // Fall back to carrying over from last week (quota path without
    // explicit placements — used when quotas are set programmatically
    // without the modal's immune-placement step).
    for (const associate of associates) {
      if (!associate.is_immune) continue;
      const prevStation = previousStationByAssociate.get(associate.id);
      if (prevStation) seatImmune(associate.id, prevStation);
    }
  }

  // `role` is optional (older/simpler callers, and some existing tests,
  // don't set it) — treat unset role as eligible rather than excluding it,
  // so only an *explicit* "team_leader" role opts someone out of the
  // tenure-targeted pools. OIC is eligible here same as associate.
  const isTenureEligible = (a: ShuffleAssociate) => a.role === undefined || a.role === "associate" || a.role === "oic";

  const remainingTenured = shuffle(
    associates.filter(
      (a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id) && isTenureEligible(a) && a.tenure_group === "tenured"
    ),
    rand
  );
  const remainingNewHire = shuffle(
    associates.filter(
      (a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id) && isTenureEligible(a) && a.tenure_group === "new_hire"
    ),
    rand
  );

  const shuffledStations = shuffle(workstations, rand);

  for (const ws of shuffledStations) {
    const quota = quotaByStation.get(ws.id) ?? { workstation_id: ws.id, headcount: 1, tenured: 0, newHire: 0 };
    let filled = stationFillCount.get(ws.id) ?? 0;

    let need = quota.headcount - filled;
    const takeTenured = Math.min(quota.tenured, remainingTenured.length, Math.max(need, 0));
    for (let i = 0; i < takeTenured; i++) {
      const person = remainingTenured.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }

    need = quota.headcount - filled;
    const takeNewHire = Math.min(quota.newHire, remainingNewHire.length, Math.max(need, 0));
    for (let i = 0; i < takeNewHire; i++) {
      const person = remainingNewHire.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }

    stationFillCount.set(ws.id, filled);
  }

  // Fallback fill: any still-open headcount slots get whoever's left
  // (associates AND, per Team Leader's instruction, OIC too) regardless of
  // tenure — coverage beats an empty seat.
  const leftover = shuffle(
    associates.filter((a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id)),
    rand
  );
  for (const ws of shuffledStations) {
    const quota = quotaByStation.get(ws.id) ?? { workstation_id: ws.id, headcount: 1, tenured: 0, newHire: 0 };
    let filled = stationFillCount.get(ws.id) ?? 0;
    while (filled < quota.headcount && leftover.length > 0) {
      const person = leftover.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }
    stationFillCount.set(ws.id, filled);
  }

  return result;
}

// ----------------------------------------------------------------------------
// Daily rotation — one call to generateAssignments() per work day, instead
// of once for the whole week. A station can (and normally will) get a
// different person Monday vs. Tuesday vs. ... Friday now.
//
// Quotas stay the same across all 5 days (same headcount/tenure split every
// day — no per-day quota config). Immune placements are day-scoped: an
// immune associate is only pinned to their placed station on the specific
// dates they were placed for; on any other day in the week they're just a
// normal eligible associate, free to land anywhere (including nowhere, if
// unlucky) like anyone else. There's no repeat-avoidance across days by
// design — each day is an independent shuffle, so the same person can land
// at the same station more than once in a week purely by chance.
// ----------------------------------------------------------------------------

export type DailyImmunePlacement = { associate_id: string; workstation_id: string; dates: string[] };
export type DailyAssignment = { workstation_id: string; associate_id: string; assignment_date: string };

export function generateDailyAssignments(
  workDates: string[],
  workstations: ShuffleWorkstation[],
  associates: ShuffleAssociate[],
  quotas: StationQuota[],
  immunePlacements: DailyImmunePlacement[],
  rand: () => number = Math.random
): DailyAssignment[] {
  const result: DailyAssignment[] = [];
  for (const date of workDates) {
    const dayImmune: ImmunePlacement[] = immunePlacements
      .filter((p) => p.dates.includes(date))
      .map((p) => ({ associate_id: p.associate_id, workstation_id: p.workstation_id }));
    // No previousAssignments/carryover here — immune placements are always
    // explicit in daily mode, same as the existing quota+immunePlacements
    // path above.
    const dayResult = generateAssignments(workstations, associates, [], rand, quotas, dayImmune);
    for (const a of dayResult) result.push({ ...a, assignment_date: date });
  }
  return result;
}
