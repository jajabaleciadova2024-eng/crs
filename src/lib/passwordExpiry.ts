// Password lifetime on the external platform: 60 days from the moment the
// password is reset. Rule 1 is that it never actually lapses, so everything
// here is oriented around the warning window rather than the expiry itself.

export const PASSWORD_VALID_DAYS = 60;
// Blocking starts this many days before expiry — the point at which "you
// should get to this" becomes "you cannot see next week's schedule until
// you do".
export const BLOCK_WITHIN_DAYS = 5;

const DAY_MS = 86_400_000;

// When the password expires, given when it was last reset. Null in, null out:
// a member with no confirmed reset has no known clock, which the UI reports
// as "not set" rather than as expired.
export function expiryFrom(lastResetAt: string | null): Date | null {
  if (!lastResetAt) return null;
  const t = new Date(lastResetAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + PASSWORD_VALID_DAYS * DAY_MS);
}

export function msRemaining(lastResetAt: string | null, now: number = Date.now()): number | null {
  const exp = expiryFrom(lastResetAt);
  return exp ? exp.getTime() - now : null;
}

export function daysRemaining(lastResetAt: string | null, now: number = Date.now()): number | null {
  const ms = msRemaining(lastResetAt, now);
  return ms === null ? null : Math.floor(ms / DAY_MS);
}

export type ExpiryState = "unset" | "expired" | "blocking" | "warning" | "ok";

// `unset` is deliberately its own state and NOT treated as compliant: a
// member whose baseline was never recorded is unmonitored, which is the
// thing this feature exists to prevent.
export function expiryState(lastResetAt: string | null, now: number = Date.now()): ExpiryState {
  const ms = msRemaining(lastResetAt, now);
  if (ms === null) return "unset";
  if (ms <= 0) return "expired";
  if (ms <= BLOCK_WITHIN_DAYS * DAY_MS) return "blocking";
  if (ms <= 14 * DAY_MS) return "warning";
  return "ok";
}

// Blocks once inside the 5-day window, and also when expired or never set —
// both of those are worse than "about to expire", so neither may be a way to
// avoid the block.
export function isPasswordBlocking(lastResetAt: string | null, now: number = Date.now()): boolean {
  const s = expiryState(lastResetAt, now);
  return s === "blocking" || s === "expired" || s === "unset";
}

// DD:HH:MM:SS. Clamped at zero — a negative countdown reads as a bug, and
// "expired" is communicated by the surrounding label instead.
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms);
  const s = Math.floor(clamped / 1000);
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dd)}:${p(hh)}:${p(mm)}:${p(ss)}`;
}
