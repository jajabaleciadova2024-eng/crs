"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import TaskCard from "./TaskCard";
import type { TaskData } from "./TaskCard";
import TaskModal from "./TaskModal";

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

  const nameMap = new Map(members.map((m) => [m.id, `${m.first_name} ${m.last_name}`]));

  // For TL: tasks with pending completions at the top
  const hasPendingCompletions = canManage
    ? tasks.filter((t) => t.completions?.some((c) => c.status === "pending"))
    : [];
  const incomplete = tasks.filter(
    (t) => t.completionStatus !== "approved" && !hasPendingCompletions.includes(t),
  );
  const approved = tasks.filter(
    (t) => t.completionStatus === "approved" && !hasPendingCompletions.includes(t),
  );

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

  function renderCards(list: TaskData[]) {
    return list.map((t) => (
      <TaskCard
        key={t.id}
        task={t}
        canManage={canManage}
        assigneeName={t.assign_to !== "all" ? nameMap.get(t.assign_to) : undefined}
        onEdit={() => { setEditTask(t); setShowModal(true); }}
        onDelete={() => setDeleteId(t.id)}
      />
    ));
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

      {tasks.length === 0 && (
        <p className="text-[var(--muted)] text-sm py-6 text-center">No tasks yet.</p>
      )}

      {/* TL: Pending Approvals section */}
      {hasPendingCompletions.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-wider text-[var(--warn)] font-semibold mb-2">
            Pending Approvals ({hasPendingCompletions.length})
          </h3>
          <div className="flex flex-col gap-2 mb-4">{renderCards(hasPendingCompletions)}</div>
        </>
      )}

      {incomplete.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">{renderCards(incomplete)}</div>
      )}

      {approved.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2 mt-4">
            Completed ({approved.length})
          </h3>
          <div className="flex flex-col gap-2">{renderCards(approved)}</div>
        </>
      )}

      {showModal && (
        <TaskModal
          members={members}
          editTask={editTask}
          onClose={() => { setShowModal(false); setEditTask(null); }}
        />
      )}

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
