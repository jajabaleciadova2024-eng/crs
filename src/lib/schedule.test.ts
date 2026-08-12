import { describe, it, expect } from "vitest";
import { generateAssignments } from "./schedule";

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
