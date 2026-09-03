// How long a member is left alone after being nudged about a task.
//
// A nudge costs nothing to send and, before task_pokes existed, left no
// trace — so the same person could be poked about the same task as often as
// the button was clicked, and a notification that arrives five times in a
// row stops being read at all. The cooldown is per (task, member): being
// chased about one task should not silence a nudge about a different one.
export const POKE_COOLDOWN_HOURS = 6;
export const POKE_COOLDOWN_MS = POKE_COOLDOWN_HOURS * 60 * 60 * 1000;

/** Milliseconds left before this member can be nudged again, 0 if ready. */
export function pokeCooldownRemaining(lastPokedAt: string | null | undefined, now = Date.now()): number {
  if (!lastPokedAt) return 0;
  const elapsed = now - new Date(lastPokedAt).getTime();
  if (Number.isNaN(elapsed)) return 0;
  return Math.max(0, POKE_COOLDOWN_MS - elapsed);
}

/** "in 4h", "in 25m" — what to put on a disabled nudge button. */
export function formatCooldown(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
