import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInManila } from "@/lib/scheduleDates";
import { assigneesOf } from "@/lib/taskAssignment";

// Daily nudge for tasks approaching or past their deadline.
//
// Like expiry-reminders, this is the system speaking to a member about their
// own outstanding work — an event nobody performs — so it can only be driven
// by a scheduled pass. Protected the same way: Vercel sends
// `Authorization: Bearer <CRON_SECRET>`, and the route refuses to run if
// CRON_SECRET is unset.
//
// A member gets at most one "due" and one "overdue" reminder per day
// (deduped by type + recipient over 20h), no matter how many tasks they owe,
// so a busy day never floods the bell.

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayInManila();
  const tomorrow = addDays(today, 1);
  // Don't nag about tasks abandoned long ago — cap the overdue window.
  const overdueFloor = addDays(today, -30);

  const [{ data: tasks }, { data: members }] = await Promise.all([
    admin
      .from("member_tasks")
      .select("id, assign_to, excluded_ids, deadline")
      .not("deadline", "is", null)
      .lte("deadline", tomorrow)
      .gte("deadline", overdueFloor),
    admin.from("profiles").select("id").eq("is_active", true),
  ]);

  const memberIds = (members ?? []).map((m: { id: string }) => m.id);
  if (!tasks || tasks.length === 0 || memberIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  // Who has already settled which task (approved or pending both count as
  // "done for reminder purposes" — a pending submission is awaiting review,
  // not owed work).
  const taskIds = tasks.map((t: { id: string }) => t.id);
  const { data: completions } = await admin
    .from("member_task_completions")
    .select("task_id, profile_id, status")
    .in("task_id", taskIds)
    .in("status", ["approved", "pending"]);
  const settled = new Set((completions ?? []).map((c: { task_id: string; profile_id: string }) => `${c.task_id}:${c.profile_id}`));

  // Per member: do they owe a task due today/tomorrow, and/or an overdue one?
  const dueMembers = new Set<string>();
  const overdueMembers = new Set<string>();
  for (const task of tasks as { id: string; assign_to: string; excluded_ids: string[] | null; deadline: string }[]) {
    const owed = assigneesOf(task, memberIds).filter((id) => !settled.has(`${task.id}:${id}`));
    const isOverdue = task.deadline < today;
    for (const id of owed) {
      if (isOverdue) overdueMembers.add(id);
      else dueMembers.add(id);
    }
  }

  if (dueMembers.size === 0 && overdueMembers.size === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  // One reminder per member per type per day — guard against same-day re-runs.
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("notifications")
    .select("recipient_id, type")
    .in("type", ["task_due", "task_overdue"])
    .gte("created_at", since);
  const alreadyTold = new Set((recent ?? []).map((r: { recipient_id: string; type: string }) => `${r.type}:${r.recipient_id}`));

  const rows: Record<string, unknown>[] = [];
  const push = (id: string, type: "task_due" | "task_overdue") => {
    if (alreadyTold.has(`${type}:${id}`)) return;
    rows.push({
      recipient_id: id,
      actor_id: id,
      type,
      post_id: null,
      comment_id: null,
      reaction: null,
      read: false,
    });
  };
  for (const id of overdueMembers) push(id, "task_overdue");
  // Don't double-ping: a member with an overdue task already got a stronger
  // nudge, so skip the softer "due soon" one for them.
  for (const id of dueMembers) if (!overdueMembers.has(id)) push(id, "task_due");

  if (rows.length > 0) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.error("[deadline-reminders] insert failed:", error);
  }

  return NextResponse.json({ ok: true, notified: rows.length });
}
