// Blocking logic for member tasks — determines whether an incomplete task
// should block a member from viewing future schedules.

import { addDays, todayInManila } from "./scheduleDates";

/**
 * A task blocks on a given date if:
 * - It has no deadline → always blocks (until completed)
 * - It has a deadline → blocks from (deadline - blocker_days_before) through deadline
 */
export function isTaskBlockingOnDate(
  task: { deadline: string | null; blocker_days_before: number },
  dateStr: string,
): boolean {
  if (!task.deadline) return true;
  const activationDate = addDays(task.deadline, -task.blocker_days_before);
  return dateStr >= activationDate && dateStr <= task.deadline;
}

export function isTaskBlockingToday(
  task: { deadline: string | null; blocker_days_before: number },
): boolean {
  return isTaskBlockingOnDate(task, todayInManila());
}
