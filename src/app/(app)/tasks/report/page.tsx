// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, PageHeader, Card } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import TaskReport, { type ReportRow, type ReportTask } from "./TaskReport";
import { taskAppliesTo } from "@/lib/taskAssignment";

// Full task × member matrix. The point of this page is the people who are
// MISSING: a member who never submitted has no member_task_completions row
// at all, so they are invisible in any list built from completions alone.
// Those are exactly the people who need chasing, so the roster is the
// starting point here and completions are joined onto it.
export default async function TaskReportPage() {
  const profile = await requireProfile();
  if (!canManageOperations(profile.role)) redirect("/tasks");

  const admin = createAdminClient();
  const [{ data: tasks }, { data: completions, error: completionsError }, { data: members }] = await Promise.all([
    admin.from("member_tasks").select("*").order("created_at", { ascending: false }),
    admin
      .from("member_task_completions")
      .select("id, task_id, profile_id, status, completed_at, completion_date, review_note, photo_path, photo_paths"),
    admin
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("is_active", true)
      .order("first_name"),
  ]);

  // Surface a failed query rather than rendering an empty matrix as if
  // nobody had submitted anything — same trap the tasks page itself warns
  // about for the ambiguous-embed case.
  if (completionsError) console.error("[tasks/report] completions query failed:", completionsError);

  const byTaskProfile = new Map<string, any>();
  for (const c of completions ?? []) byTaskProfile.set(`${c.task_id}::${c.profile_id}`, c);

  // Whoever actually has a completion row, keyed by id — a real submission
  // proves someone was a legitimate assignee at the time, whatever the
  // roster says about them NOW.
  const submitterIds = new Set((completions ?? []).map((c: any) => c.profile_id as string));
  const rosterIds = new Set((members ?? []).map((m: any) => m.id as string));
  // Anyone who submitted but has since dropped out of the "active,
  // non-Team-Leader" roster snapshot (deactivated, role changed) — fetched
  // once, by id, so their name/history is never lost from this page just
  // because their current status changed.
  const strayIds = [...submitterIds].filter((id) => !rosterIds.has(id));
  const { data: strayProfiles } = strayIds.length > 0
    ? await admin.from("profiles").select("id, first_name, last_name").in("id", strayIds)
    : { data: [] };
  const profileById = new Map<string, { id: string; first_name: string; last_name: string }>([
    ...(members ?? []).map((m: any) => [m.id, m] as const),
    ...(strayProfiles ?? []).map((m: any) => [m.id, m] as const),
  ]);

  const reportTasks: ReportTask[] = [];
  for (const t of (tasks ?? []) as any[]) {
    // Who this task is for, on the roster as it stands today, PLUS anyone
    // who has ever submitted against it. The point of this page is
    // catching who needs follow-up — a member losing their submission's
    // visibility here because they were deactivated (or their role
    // changed) between submitting and being reviewed is exactly the kind
    // of person a Team Leader must not lose track of.
    const rosterAssigneeIds = (members ?? [])
      .map((m: any) => m.id as string)
      .filter((id: string) => taskAppliesTo(t, id));
    const strayAssigneeIds = strayIds.filter((id) => byTaskProfile.has(`${t.id}::${id}`));
    const assigneeIds = [...new Set([...rosterAssigneeIds, ...strayAssigneeIds])];

    const rows: ReportRow[] = assigneeIds
      .map((id) => profileById.get(id))
      .filter((m): m is { id: string; first_name: string; last_name: string } => !!m)
      .map((m) => {
        const c = byTaskProfile.get(`${t.id}::${m.id}`);
        return {
          profileId: m.id,
          name: formatFullName(m.first_name, m.last_name),
          status: (c?.status as ReportRow["status"]) ?? "none",
          submittedAt: c?.completed_at ?? null,
          completionDate: c?.completion_date ?? null,
          reviewNote: c?.review_note ?? null,
          // The completion id, so the report can open the same proof viewer
        // the review screen uses instead of only hinting a photo exists.
        completionId: c?.id ?? null,
        photoCount: c?.photo_paths?.length ? c.photo_paths.length : c?.photo_path ? 1 : 0,
        };
      });

    reportTasks.push({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      assignTo: t.assign_to,
      requiresApproval: t.requires_approval !== false,
      requiresPhoto: !!t.requires_photo,
      requiresCompletionDate: !!t.requires_completion_date,
      blockingNow: isTaskBlockingToday(t),
      rows,
    });
  }

  // Headline counts. "Needs follow-up" is the number that matters: not
  // submitted, or declined and not yet re-submitted.
  const allRows = reportTasks.flatMap((t) => t.rows);
  const outstanding = allRows.filter((r) => r.status === "none" || r.status === "rejected").length;
  const awaitingReview = allRows.filter((r) => r.status === "pending").length;
  const approved = allRows.filter((r) => r.status === "approved").length;

  return (
    <>
      <PageHeader
        title="Task Report"
        subtitle="Every task against every member — who has done it, who is waiting on you, and who needs chasing"
        action={
          <Link href="/tasks" className="text-xs font-bold text-[var(--accent-strong)]">
            ← Back to Tasks
          </Link>
        }
      />

      {completionsError && (
        <div className="mb-4 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-4 py-3 text-[13px] text-[var(--bad)]">
          Couldn&apos;t load submission data — the counts and rows below may be incomplete. Reload the page; if this
          keeps happening, tell your developer.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card
          label="Needs follow-up"
          value={String(outstanding)}
          sub="Not submitted, or declined"
          tone={outstanding > 0 ? "warn" : undefined}
        />
        <Card label="Awaiting your review" value={String(awaitingReview)} sub="Submitted, not yet decided" />
        <Card label="Approved" value={String(approved)} sub="Done and signed off" />
      </div>

      {reportTasks.length === 0 ? (
        <Panel title="No tasks yet">
          <p className="text-sm text-[var(--muted)] m-0">
            Once you create a task it will appear here with every assigned member&apos;s progress.
          </p>
        </Panel>
      ) : (
        <TaskReport tasks={reportTasks} />
      )}
    </>
  );
}
