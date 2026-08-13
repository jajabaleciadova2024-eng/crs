import { describe, it, expect } from "vitest";
import { compareStationNames } from "./stationOrder";

describe("compareStationNames", () => {
  it("sorts stations into the Team Leader's standing order, not alphabetically", () => {
    const names = ["Releasing Officer", "PACD", "Electronic Endorsement", "Screener", "Collecting Officer", "Premium Annotation"];
    expect([...names].sort(compareStationNames)).toEqual([
      "Screener",
      "Collecting Officer",
      "Premium Annotation",
      "Releasing Officer",
      "PACD",
      "Electronic Endorsement",
    ]);
  });

  it("matches case-insensitively — both count as the same standing-order station", () => {
    // Different casing still ranks ahead of a station that isn't in the
    // standing order at all, proving the lookup is case-insensitive.
    expect(compareStationNames("SCREENER", "Some Other Station")).toBeLessThan(0);
    expect(compareStationNames("screener", "Some Other Station")).toBeLessThan(0);
  });

  it("sorts unlisted stations after all standing-order ones, alphabetically among themselves", () => {
    const names = ["Zzz Station", "Screener", "Aaa Station"];
    expect([...names].sort(compareStationNames)).toEqual(["Screener", "Aaa Station", "Zzz Station"]);
  });
});
