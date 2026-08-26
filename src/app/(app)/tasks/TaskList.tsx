"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import TaskCard from "./TaskCard";
import TaskModal from "./TaskModal";

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

export default function TaskList({
  tasks,
  canManage,
  members,
}: {
  tasks: TaskData[];
  canManage: boolean;
  members: { id: string; first_name: string; last_name: string }[];
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<TaskData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Build a name map for individual assignments
  const nameMap = new Map(members.map((m) => [m.id, `${m.first_name} ${m.last_name}`]));

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteId }),
    });
    setDeleting(false);
    setDeleteId(null);
    router.refresh();
  }

  return (
    <>
      {canManage && (
        <div className="mb-4">
          <Button variant="primary" onClick={() => { setEditTask(null); setShowModal(true); }}>
            + Add task
          </Button>
        </div>
      )}

      {pending.length === 0 && completed.length === 0 && (
        <p className="text-[var(--muted)] text-sm py-6 text-center">No tasks yet.</p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {pending.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              canManage={canManage}
              assigneeName={t.assign_to !== "all" ? nameMap.get(t.assign_to) : undefined}
              onEdit={() => { setEditTask(t); setShowModal(true); }}
              onDelete={() => setDeleteId(t.id)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2 mt-4">
            Completed ({completed.length})
          </h3>
          <div className="flex flex-col gap-2">
            {completed.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                canManage={canManage}
                assigneeName={t.assign_to !== "all" ? nameMap.get(t.assign_to) : undefined}
                onEdit={() => { setEditTask(t); setShowModal(true); }}
                onDelete={() => setDeleteId(t.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <TaskModal
          members={members}
          editTask={editTask}
          onClose={() => { setShowModal(false); setEditTask(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setDeleteId(null)}>
          <div
            className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl w-full max-w-sm p-5 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold mb-2">Delete task?</h2>
            <p className="text-[13px] text-[var(--muted)] mb-4">
              This will permanently delete this task and all completion records. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleDelete}
                disabled={deleting}
                style={{ backgroundColor: "var(--bad)", borderColor: "var(--bad)" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
