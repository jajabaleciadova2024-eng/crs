import { describe, it, expect } from "vitest";
import { generateAssignments, generateDailyAssignments } from "./schedule";

// Deterministic "shuffle" for tests: rand always returns 0, which makes the
// Fisher-Yates shuffle a no-op (keeps input order) — lets us assert exact
// pairings instead of just set membership.
const noShuffle = () => 0;

describe("generateAssignments", () => {
  it("assigns one associate per station when counts match, no immune", () => {
    const workstations = [{ id: "w1" }, { id: "w2" }];
    const associates = [
      { id: "a1", is_immune: false },
      { id: "a2", is_immune: false },
    ];
    const result = generateAssignments(workstations, associates, [], noShuffle);

    expect(result).toHaveLength(2);
    const stationIds = result.map((r) => r.workstation_id).sort();
    expect(stationIds).toEqual(["w1", "w2"]);
    // Every associate placed exactly once.
    const associateIds = result.map((r) => r.associate_id).sort();
    expect(associateIds).toEqual(["a1", "a2"]);
  });

  it("keeps an immune associate pinned to their previous station", () => {
    const workstations = [{ id: "w1" }, { id: "w2" }];
    const associates = [
      { id: "a1", is_immune: true },
      { id: "a2", is_immune: false },
    ];
    const previous = [{ workstation_id: "w1", associate_id: "a1" }];
    const result = generateAssignments(workstations, associates, previous, noShuffle);

    expect(result).toContainEqual({ workstation_id: "w1", associate_id: "a1" });
    // a2 gets whatever station is left over (w2).
    expect(result).toContainEqual({ workstation_id: "w2", associate_id: "a2" });
    expect(result).toHaveLength(2);
  });

  it("does not pin an immune associate whose previous station no longer exists", () => {
    const workstations = [{ id: "w2" }];
    const associates = [{ id: "a1", is_immune: true }];
    const previous = [{ workstation_id: "w1", associate_id: "a1" }]; // w1 gone
    const result = generateAssignments(workstations, associates, previous, noShuffle);

    // a1 still gets shuffled into the only remaining open station.
    expect(result).toEqual([{ workstation_id: "w2", associate_id: "a1" }]);
  });

  it("leaves extra stations unfilled when there are fewer associates than stations", () => {
    const workstations = [{ id: "w1" }, { id: "w2" }, { id: "w3" }];
    const associates = [{ id: "a1", is_immune: false }];
    const result = generateAssignments(workstations, associates, [], noShuffle);

    expect(result).toHaveLength(1);
  });

  it("leaves extra associates unassigned when there are fewer stations than associates", () => {
    const workstations = [{ id: "w1" }];
    const associates = [
      { id: "a1", is_immune: false },
      { id: "a2", is_immune: false },
    ];
    const result = generateAssignments(workstations, associates, [], noShuffle);

    expect(result).toHaveLength(1);
  });

  it("returns nothing when there are no stations or associates", () => {
    expect(generateAssignments([], [], [])).toEqual([]);
  });
});

describe("generateAssignments with quotas", () => {
  it("fills a station's headcount with the requested tenured/new-hire split", () => {
    const workstations = [{ id: "w1" }];
    const associates = [
      { id: "t1", is_immune: false, tenure_group: "tenured" as const },
      { id: "t2", is_immune: false, tenure_group: "tenured" as const },
      { id: "n1", is_immune: false, tenure_group: "new_hire" as const },
    ];
    const quotas = [{ workstation_id: "w1", headcount: 3, tenured: 2, newHire: 1 }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas);

    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.associate_id).sort();
    expect(ids).toEqual(["n1", "t1", "t2"]);
  });

  it("keeps an immune associate on their station, counting toward its headcount", () => {
    const workstations = [{ id: "w1" }];
    const associates = [
      { id: "imm", is_immune: true, tenure_group: "tenured" as const },
      { id: "t1", is_immune: false, tenure_group: "tenured" as const },
    ];
    const previous = [{ workstation_id: "w1", associate_id: "imm" }];
    const quotas = [{ workstation_id: "w1", headcount: 2, tenured: 2, newHire: 0 }];
    const result = generateAssignments(workstations, associates, previous, noShuffle, quotas);

    expect(result).toContainEqual({ workstation_id: "w1", associate_id: "imm" });
    expect(result).toContainEqual({ workstation_id: "w1", associate_id: "t1" });
    expect(result).toHaveLength(2);
  });

  it("falls back to filling remaining headcount from anyone left, ignoring tenure, rather than leaving seats empty", () => {
    const workstations = [{ id: "w1" }];
    const associates = [{ id: "n1", is_immune: false, tenure_group: "new_hire" as const }];
    // Quota asks for 2 tenured, but there are none — fallback should still
    // seat the one available new-hire instead of leaving the seat empty.
    const quotas = [{ workstation_id: "w1", headcount: 1, tenured: 2, newHire: 0 }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas);

    expect(result).toEqual([{ workstation_id: "w1", associate_id: "n1" }]);
  });

  it("doesn't exceed a station's headcount even if tenured+newHire quota adds up to more", () => {
    const workstations = [{ id: "w1" }];
    const associates = [
      { id: "t1", is_immune: false, tenure_group: "tenured" as const },
      { id: "t2", is_immune: false, tenure_group: "tenured" as const },
      { id: "n1", is_immune: false, tenure_group: "new_hire" as const },
    ];
    const quotas = [{ workstation_id: "w1", headcount: 1, tenured: 2, newHire: 1 }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas);

    expect(result).toHaveLength(1);
  });

  it("uses explicit immunePlacements instead of last week's assignment when given", () => {
    const workstations = [{ id: "w1" }, { id: "w2" }];
    const associates = [{ id: "imm", is_immune: true, tenure_group: "tenured" as const }];
    // Was on w1 last week, but the Team Leader is explicitly placing them
    // on w2 this time via the modal.
    const previous = [{ workstation_id: "w1", associate_id: "imm" }];
    const quotas = [
      { workstation_id: "w1", headcount: 1, tenured: 0, newHire: 0 },
      { workstation_id: "w2", headcount: 1, tenured: 0, newHire: 0 },
    ];
    const immunePlacements = [{ associate_id: "imm", workstation_id: "w2" }];
    const result = generateAssignments(workstations, associates, previous, noShuffle, quotas, immunePlacements);

    expect(result).toContainEqual({ workstation_id: "w2", associate_id: "imm" });
    expect(result).not.toContainEqual({ workstation_id: "w1", associate_id: "imm" });
  });

  it("does not seat an immune placement beyond that station's headcount", () => {
    const workstations = [{ id: "w1" }];
    const associates = [{ id: "imm", is_immune: true, tenure_group: "tenured" as const }];
    const quotas = [{ workstation_id: "w1", headcount: 0, tenured: 0, newHire: 0 }];
    const immunePlacements = [{ associate_id: "imm", workstation_id: "w1" }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas, immunePlacements);

    expect(result).toEqual([]);
  });

  it("seats multiple immune members placed at the same station, up to its full headcount", () => {
    // Regression: two Team-Leader-chosen immune members sent to the same
    // 2-seat station both need to land there, not get silently bumped
    // elsewhere by the later tenured/new-hire/fallback fill steps.
    const workstations = [{ id: "w1" }, { id: "w2" }];
    const associates = [
      { id: "imm1", is_immune: true, tenure_group: "tenured" as const },
      { id: "imm2", is_immune: true, tenure_group: "new_hire" as const },
      { id: "other1", is_immune: false, tenure_group: "tenured" as const },
      { id: "other2", is_immune: false, tenure_group: "new_hire" as const },
    ];
    const quotas = [
      { workstation_id: "w1", headcount: 2, tenured: 1, newHire: 1 },
      { workstation_id: "w2", headcount: 2, tenured: 1, newHire: 1 },
    ];
    const immunePlacements = [
      { associate_id: "imm1", workstation_id: "w1" },
      { associate_id: "imm2", workstation_id: "w1" },
    ];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas, immunePlacements);

    expect(result).toContainEqual({ workstation_id: "w1", associate_id: "imm1" });
    expect(result).toContainEqual({ workstation_id: "w1", associate_id: "imm2" });
    // w1's headcount (2) is fully spent on the two immune placements —
    // the tenured/new-hire targets for w1 must NOT push anyone else in
    // on top of them.
    expect(result.filter((r) => r.workstation_id === "w1")).toHaveLength(2);
  });

  it("treats OIC the same as an associate for the targeted new-hire slot (Team Leader wants tenure applied to OIC too)", () => {
    const workstations = [{ id: "w1" }];
    const associates = [
      { id: "oic1", is_immune: false, tenure_group: "new_hire" as const, role: "oic" as const },
      { id: "n1", is_immune: false, tenure_group: "new_hire" as const, role: "associate" as const },
    ];
    const quotas = [{ workstation_id: "w1", headcount: 1, tenured: 0, newHire: 1 }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas);
    // Both are equally eligible for the targeted new-hire pool now — no
    // preference either way (noShuffle's rand=0 still runs one Fisher-
    // Yates swap on a 2-element array, so it's "n1" here, not just
    // whichever came first in the input).
    expect(result).toEqual([{ workstation_id: "w1", associate_id: "n1" }]);
  });

  it("still seats OIC via fallback fill when no tenure quota targets them (Team Leader wants OIC included)", () => {
    const workstations = [{ id: "w1" }];
    const associates = [{ id: "oic1", is_immune: false, tenure_group: "new_hire" as const, role: "oic" as const }];
    const quotas = [{ workstation_id: "w1", headcount: 1, tenured: 0, newHire: 0 }];
    const result = generateAssignments(workstations, associates, [], noShuffle, quotas);
    expect(result).toEqual([{ workstation_id: "w1", associate_id: "oic1" }]);
  });
});

describe("generateDailyAssignments", () => {
  const workDates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"]; // Mon-Fri

  it("produces one assignment per work date, each tagged with its date", () => {
    const workstations = [{ id: "w1" }];
    const associates = [{ id: "a1", is_immune: false }];
    const quotas = [{ workstation_id: "w1", headcount: 1, tenured: 0, newHire: 0 }];
    const result = generateDailyAssignments(workDates, workstations, associates, quotas, [], noShuffle);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.assignment_date)).toEqual(workDates);
    expect(result.every((r) => r.workstation_id === "w1" && r.associate_id === "a1")).toBe(true);
  });

  it("pins an immune placement only on its selected dates — free-roaming on the others", () => {
    const workstations = [{ id: "w1" }, { id: "w2" }];
    const associates = [
      { id: "immune1", is_immune: true },
      { id: "a2", is_immune: false },
    ];
    const quotas = [
      { workstation_id: "w1", headcount: 1, tenured: 0, newHire: 1 },
      { workstation_id: "w2", headcount: 1, tenured: 0, newHire: 1 },
    ];
    // Pinned to w1 on Monday and Tuesday only.
    const immunePlacements = [{ associate_id: "immune1", workstation_id: "w1", dates: ["2026-08-24", "2026-08-25"] }];
    const result = generateDailyAssignments(workDates, workstations, associates, quotas, immunePlacements, noShuffle);

    const byDate = new Map(workDates.map((d) => [d, result.filter((r) => r.assignment_date === d)]));
    for (const pinnedDate of ["2026-08-24", "2026-08-25"]) {
      const row = byDate.get(pinnedDate)!.find((r) => r.associate_id === "immune1");
      expect(row?.workstation_id).toBe("w1");
    }
    // On the other 3 days, immune1 isn't force-pinned to w1 — still seated
    // somewhere (only 2 associates, 2 stations, headcount 1 each) via the
    // normal fallback/tenure fill, same as any other eligible associate.
    for (const freeDate of ["2026-08-26", "2026-08-27", "2026-08-28"]) {
      const rows = byDate.get(freeDate)!;
      expect(rows.some((r) => r.associate_id === "immune1")).toBe(true);
    }
  });

  it("returns an empty array for an empty workDates list", () => {
    expect(generateDailyAssignments([], [{ id: "w1" }], [{ id: "a1", is_immune: false }], [], [], noShuffle)).toEqual([]);
  });
});
