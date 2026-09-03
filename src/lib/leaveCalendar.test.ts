import { describe, expect, it } from "vitest";
import { addMonths, buildLeaveDayMap, monthGridDates } from "./leaveCalendar";

describe("monthGridDates", () => {
  it("returns 42 dates covering the full month plus Sunday-start padding", () => {
    // Feb 2026 starts on a Sunday, so no leading padding is needed.
    const dates = monthGridDates(2026, 2);
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-02-01");
    expect(dates[6]).toBe("2026-02-07");
    // Feb has 28 days in 2026 (not a leap year).
    expect(dates).toContain("2026-02-28");
  });

  it("pads back to the preceding Sunday when the 1st falls mid-week", () => {
    // June 2026 starts on a Monday, so the grid opens on Sunday 31 May.
    const dates = monthGridDates(2026, 6);
    expect(dates[0]).toBe("2026-05-31");
    expect(dates[1]).toBe("2026-06-01");
  });

  it("starts every month's grid on a Sunday, on every device", () => {
    // The whole point of the Sunday-start rule: no month may open on any
    // other weekday, whatever the viewer's locale would otherwise pick.
    for (let m = 1; m <= 12; m++) {
      const first = monthGridDates(2026, m)[0];
      expect(new Date(`${first}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});

describe("addMonths", () => {
  it("rolls over into the next year", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls back into the previous year", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("handles a plain same-year shift", () => {
    expect(addMonths(2026, 6, 2)).toEqual({ year: 2026, month: 8 });
  });
});

describe("buildLeaveDayMap", () => {
  it("expands a multi-day range into one entry per day", () => {
    const map = buildLeaveDayMap([
      { id: "1", name: "Jerick Salinas", leave_type: "vacation", status: "approved", ranges: [{ start_date: "2026-03-10", end_date: "2026-03-12" }] },
    ]);
    expect(Object.keys(map).sort()).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
    expect(map["2026-03-11"]).toEqual([{ id: "1", name: "Jerick Salinas", leaveType: "vacation", status: "approved" }]);
  });

  it("stacks multiple people on the same day", () => {
    const map = buildLeaveDayMap([
      { id: "1", name: "A", leave_type: "sick", status: "pending", ranges: [{ start_date: "2026-03-10", end_date: "2026-03-10" }] },
      { id: "2", name: "B", leave_type: "vacation", status: "approved", ranges: [{ start_date: "2026-03-10", end_date: "2026-03-10" }] },
    ]);
    expect(map["2026-03-10"]).toHaveLength(2);
  });

  it("handles non-consecutive extra ranges on one request", () => {
    const map = buildLeaveDayMap([
      {
        id: "1",
        name: "A",
        leave_type: "other",
        status: "approved",
        ranges: [
          { start_date: "2026-03-01", end_date: "2026-03-01" },
          { start_date: "2026-03-15", end_date: "2026-03-15" },
        ],
      },
    ]);
    expect(Object.keys(map).sort()).toEqual(["2026-03-01", "2026-03-15"]);
  });
});
