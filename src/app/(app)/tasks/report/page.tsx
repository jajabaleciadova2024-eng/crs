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

// Full task × member matrix. The point of this page is the people who are
// MISSING: a member who never submitted has no member_task_completions row
// at all, so they are invisible in any list built from completions alone.
// Those are exactly the people who need chasing, so the roster is the
// starting point here and completions are joined onto it.
export default async function TaskReportPage() {
  const profile = await requireProfile();
  if (!canManageOperations(profile.role)) redirect("/tasks");

  const admin = createAdminClient();
  const [{ data: tasks }, { data: completions }, { data: members }] = await Promise.all([
    admin.from("member_tasks").select("*").order("created_at", { ascending: false }),
    admin
      .from("member_task_completions")
      .select("task_id, profile_id, status, completed_at, completion_date, review_note, photo_path"),
    admin
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("is_active", true)
      .neq("role", "team_leader")
      .order("first_name"),
  ]);

  const byTaskProfile = new Map<string, any>();
  for (const c of completions ?? []) byTaskProfile.set(`${c.task_id}::${c.profile_id}`, c);

  const reportTasks: ReportTask[] = [];
  for (const t of (tasks ?? []) as any[]) {
    // Who this task is actually for. 'all' means every active non-TL member;
    // otherwise the single named assignee (skipped if they've since been
    // deactivated, which is why this can come out empty).
    const assignees =
      t.assign_to === "all" ? (members ?? []) : (members ?? []).filter((m: any) => m.id === t.assign_to);

    const rows: ReportRow[] = assignees.map((m: any) => {
      const c = byTaskProfile.get(`${t.id}::${m.id}`);
      return {
        profileId: m.id,
        name: formatFullName(m.first_name, m.last_name),
        status: (c?.status as ReportRow["status"]) ?? "none",
        submittedAt: c?.completed_at ?? null,
        completionDate: c?.completion_date ?? null,
        reviewNote: c?.review_note ?? null,
        hasPhoto: !!c?.photo_path,
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
