import { describe, it, expect } from "vitest";
import { addDays, startOfWorkWeek, endOfWorkWeek } from "./scheduleDates";

describe("startOfWorkWeek", () => {
  it("returns the same date when given a Monday", () => {
    expect(startOfWorkWeek("2026-08-17")).toBe("2026-08-17"); // a Monday
  });

  it("rolls back to Monday for a mid-week date", () => {
    expect(startOfWorkWeek("2026-08-19")).toBe("2026-08-17"); // Wednesday
  });

  it("rolls back to Monday for a Sunday", () => {
    expect(startOfWorkWeek("2026-08-23")).toBe("2026-08-17"); // Sunday
  });
});

describe("endOfWorkWeek", () => {
  it("is Friday, four days after Monday", () => {
    expect(endOfWorkWeek("2026-08-17")).toBe("2026-08-21");
  });
});

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-08-17", 3)).toBe("2026-08-20");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("supports negative days", () => {
    expect(addDays("2026-08-17", -3)).toBe("2026-08-14");
  });
});
