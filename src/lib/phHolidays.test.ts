import { describe, it, expect } from "vitest";
import { getPhilippineHolidays, holidaysInRange } from "./phHolidays";

describe("getPhilippineHolidays", () => {
  it("includes the fixed-date regular holidays for a given year", () => {
    const holidays = getPhilippineHolidays(2026);
    const dates = holidays.map((h) => h.date);
    expect(dates).toContain("2026-01-01"); // New Year's Day
    expect(dates).toContain("2026-06-12"); // Independence Day
    expect(dates).toContain("2026-12-25"); // Christmas Day
  });

  it("computes Good Friday correctly (known: April 3, 2026)", () => {
    const holidays = getPhilippineHolidays(2026);
    const goodFriday = holidays.find((h) => h.name === "Good Friday");
    expect(goodFriday?.date).toBe("2026-04-03");
  });

  it("computes National Heroes Day as the last Monday of August", () => {
    const holidays = getPhilippineHolidays(2026);
    const heroesDay = holidays.find((h) => h.name === "National Heroes Day");
    expect(heroesDay?.date).toBe("2026-08-31");
  });

  it("returns holidays sorted by date", () => {
    const holidays = getPhilippineHolidays(2026);
    const dates = holidays.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("holidaysInRange", () => {
  it("finds a holiday within a single work week", () => {
    const result = holidaysInRange("2026-06-08", "2026-06-12");
    expect(result.map((h) => h.name)).toContain("Independence Day");
  });

  it("returns nothing for a range with no holidays", () => {
    const result = holidaysInRange("2026-02-02", "2026-02-06");
    expect(result).toEqual([]);
  });

  it("handles ranges spanning two years", () => {
    const result = holidaysInRange("2026-12-29", "2027-01-02");
    expect(result.map((h) => h.name)).toEqual(expect.arrayContaining(["Rizal Day", "New Year's Day"]));
  });
});
