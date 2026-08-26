"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { isTaskBlockingToday } from "@/lib/taskBlocking";

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assign_to: string;
  blocker_days_before: number;
  completed: boolean;
  created_at: string;
  profiles?: { first_name: string; last_name: string } | null;
  completions?: { profile_id: string; completed_at: string; profiles: { first_name: string; last_name: string } | null }[];
}

export default function TaskCard({
  task,
  canManage,
  assigneeName,
  onEdit,
  onDelete,
}: {
  task: TaskData;
  canManage: boolean;
  assigneeName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const blocking = isTaskBlockingToday(task);

  async function toggleComplete() {
    setToggling(true);
    await fetch("/api/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, undo: task.completed }),
    });
    setToggling(false);
    router.refresh();
  }

  return (
    <div
      className={`border border-[var(--line)] rounded-lg px-4 py-3 transition-all ${
        task.completed ? "bg-[var(--paper)]/60 opacity-70" : "bg-[var(--paper-raised)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Completion checkbox */}
        <button
          type="button"
          onClick={toggleComplete}
          disabled={toggling}
          className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-[var(--line)] flex items-center justify-center cursor-pointer hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          style={task.completed ? { backgroundColor: "var(--accent)", borderColor: "var(--accent)" } : undefined}
          title={task.completed ? "Mark as incomplete" : "Mark as complete"}
        >
          {task.completed && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] font-semibold ${task.completed ? "line-through text-[var(--muted)]" : "text-[var(--ink)]"}`}>
              {task.title}
            </span>
            {task.assign_to === "all" ? (
              <Pill tone="accent">All members</Pill>
            ) : (
              <Pill tone="muted">{assigneeName ?? "Individual"}</Pill>
            )}
            {blocking && !task.completed && <Pill tone="warn">Blocking</Pill>}
            {task.completed && <Pill tone="good">Done</Pill>}
          </div>

          {task.description && (
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">{task.description}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--muted)]">
            {task.deadline && (
              <span>Deadline: {task.deadline}</span>
            )}
            {task.deadline && task.blocker_days_before > 0 && (
              <span>Blocks {task.blocker_days_before}d before</span>
            )}
            {!task.deadline && (
              <span>No deadline — blocks until done</span>
            )}
          </div>

          {/* TL: show completion progress for all-member tasks */}
          {canManage && task.completions && task.completions.length > 0 && (
            <div className="mt-2 text-[11px] text-[var(--muted)]">
              <span className="font-semibold">Completed by:</span>{" "}
              {task.completions.map((c) =>
                c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name}` : c.profile_id,
              ).join(", ")}
            </div>
          )}
        </div>

        {/* TL edit/delete actions */}
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent-strong)] transition-colors cursor-pointer"
              title="Edit task"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-[var(--bad-soft)] text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer"
              title="Delete task"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
