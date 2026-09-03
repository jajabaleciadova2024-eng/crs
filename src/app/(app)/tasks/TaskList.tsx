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
  // Task + how many of its completions are still pending review, so the
  // confirmation can name exactly what disappears — a generic warning was
  // easy to click past without registering that real, un-reviewed work was
  // about to be discarded along with the task.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; pendingCount: number } | null>(null);
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
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    setDeleting(false);
    setDeleteTarget(null);
    router.refresh();
  }

  function renderCards(list: TaskData[]) {
    return list.map((t) => (
      <TaskCard
        key={t.id}
        task={t}
        canManage={canManage}
        assigneeName={t.assign_to !== "all" ? nameMap.get(t.assign_to) : undefined}
        roster={members}
        onEdit={() => { setEditTask(t); setShowModal(true); }}
        onDelete={() =>
          setDeleteTarget({
            id: t.id,
            title: t.title,
            pendingCount: t.completions?.filter((c) => c.status === "pending").length ?? 0,
          })
        }
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

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start justify-center px-4 py-6 z-50 overflow-y-auto" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl w-full max-w-sm p-5 animate-scale-in my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold mb-2">Delete &ldquo;{deleteTarget.title}&rdquo;?</h2>
            {deleteTarget.pendingCount > 0 ? (
              <p className="text-[13px] text-[var(--bad)] font-semibold mb-4">
                {deleteTarget.pendingCount} submission{deleteTarget.pendingCount !== 1 ? "s" : ""} still awaiting
                your review will be discarded along with it — nobody will be notified, and there will be nothing left
                to approve. This cannot be undone.
              </p>
            ) : (
              <p className="text-[13px] text-[var(--muted)] mb-4">
                This will permanently delete this task and all completion records. This cannot be undone.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setDeleteTarget(null)}>
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
