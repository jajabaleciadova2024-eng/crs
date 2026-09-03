// Who a task is actually for.
//
// Two fields decide it and they are easy to get half-right: `assign_to` is
// 'all' or one member's id, and `excluded_ids` takes people back out again.
// Nine places ask this question — the tasks page, the report, the card, the
// submit route, the nudge route, and the four blocking checks — so the rule
// lives here once. A place that forgets the exemption list does not fail
// loudly: it just quietly chases somebody for work they were excused from,
// or blocks their schedule over it.

export type AssignableTask = {
  assign_to: string;
  excluded_ids?: string[] | null;
};

/** The things a task can lock. */
export type BlockScope = "schedule" | "leave";

export type ScopedTask = {
  blocks_schedule?: boolean | null;
  blocks_leave?: boolean | null;
};

/**
 * Whether a blocking task locks this particular thing.
 *
 * Both columns default true, and a task written before 0042 has neither —
 * which is the same thing, since back then every blocking task locked
 * everything. So absent means yes, and only an explicit false turns one off.
 */
export function taskBlocks(task: ScopedTask, scope: BlockScope): boolean {
  const flag = scope === "schedule" ? task.blocks_schedule : task.blocks_leave;
  return flag !== false;
}

/** True when `profileId` owes this task. */
export function taskAppliesTo(task: AssignableTask, profileId: string): boolean {
  if ((task.excluded_ids ?? []).includes(profileId)) return false;
  return task.assign_to === "all" || task.assign_to === profileId;
}

/** The subset of `memberIds` this task is for, preserving their order. */
export function assigneesOf(task: AssignableTask, memberIds: string[]): string[] {
  return memberIds.filter((id) => taskAppliesTo(task, id));
}
