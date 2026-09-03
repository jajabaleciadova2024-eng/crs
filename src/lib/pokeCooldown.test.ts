import { describe, expect, it } from "vitest";
import {
  pokeCooldownRemaining,
  formatCooldown,
  POKE_COOLDOWN_MS,
  POKE_COOLDOWN_HOURS,
} from "./pokeCooldown";

const NOW = Date.parse("2026-09-03T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("pokeCooldownRemaining", () => {
  it("is ready when nobody has been nudged yet", () => {
    expect(pokeCooldownRemaining(null, NOW)).toBe(0);
    expect(pokeCooldownRemaining(undefined, NOW)).toBe(0);
  });

  it("blocks straight after a nudge, for the full window", () => {
    expect(pokeCooldownRemaining(ago(0), NOW)).toBe(POKE_COOLDOWN_MS);
  });

  it("counts down as time passes", () => {
    expect(pokeCooldownRemaining(ago(2 * HOUR), NOW)).toBe(POKE_COOLDOWN_MS - 2 * HOUR);
  });

  it("is ready again exactly on the boundary, not a tick later", () => {
    expect(pokeCooldownRemaining(ago(POKE_COOLDOWN_MS), NOW)).toBe(0);
  });

  it("never goes negative once the window has long passed", () => {
    expect(pokeCooldownRemaining(ago(72 * HOUR), NOW)).toBe(0);
  });

  it("treats an unparseable timestamp as ready rather than blocking forever", () => {
    expect(pokeCooldownRemaining("not a date", NOW)).toBe(0);
  });

  it("uses the configured window", () => {
    expect(POKE_COOLDOWN_MS).toBe(POKE_COOLDOWN_HOURS * HOUR);
  });
});

describe("formatCooldown", () => {
  it("rounds up, so it never reads 0m while still blocking", () => {
    expect(formatCooldown(1)).toBe("1m");
    expect(formatCooldown(90_000)).toBe("2m");
  });

  it("drops the minutes when the wait is a whole number of hours", () => {
    expect(formatCooldown(2 * HOUR)).toBe("2h");
  });

  it("shows both parts otherwise", () => {
    expect(formatCooldown(2 * HOUR + 25 * 60_000)).toBe("2h 25m");
  });
});
