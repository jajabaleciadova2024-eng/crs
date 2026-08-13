import { describe, it, expect } from "vitest";
import { getPayPeriod } from "./payPeriod";

describe("getPayPeriod", () => {
  it("groups the 1st through 15th together", () => {
    expect(getPayPeriod("2026-08-01")).toMatchObject({ key: "2026-08-A", label: "August 1–15, 2026" });
    expect(getPayPeriod("2026-08-15")).toMatchObject({ key: "2026-08-A", label: "August 1–15, 2026" });
  });

  it("groups the 16th through end of month together", () => {
    expect(getPayPeriod("2026-08-16")).toMatchObject({ key: "2026-08-B", label: "August 16–31, 2026" });
    expect(getPayPeriod("2026-08-31")).toMatchObject({ key: "2026-08-B", label: "August 16–31, 2026" });
  });

  it("uses the correct last day for a 30-day month", () => {
    expect(getPayPeriod("2026-09-20")).toMatchObject({ key: "2026-09-B", label: "September 16–30, 2026" });
  });

  it("uses the correct last day for February in a non-leap year", () => {
    expect(getPayPeriod("2026-02-20")).toMatchObject({ key: "2026-02-B", label: "February 16–28, 2026" });
  });

  it("uses the correct last day for February in a leap year", () => {
    expect(getPayPeriod("2028-02-20")).toMatchObject({ key: "2028-02-B", label: "February 16–29, 2028" });
  });
});
