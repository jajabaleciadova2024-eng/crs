"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Button } from "@/components/ui";
import { isTaskBlockingToday } from "@/lib/taskBlocking";

export type CompletionStatus = "none" | "pending" | "approved" | "rejected";

interface CompletionEntry {
  id: string;
  profile_id: string;
  status: string;
  completed_at: string;
  photo_path: string | null;
  review_note: string | null;
  profiles: { first_name: string; last_name: string } | null;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assign_to: string;
  blocker_days_before: number;
  completionStatus: CompletionStatus;
  requires_approval?: boolean;
  requires_photo?: boolean;
  // The Team Leader's reason, when THIS viewer's submission was declined.
  myReviewNote?: string | null;
  created_at: string;
  profiles?: { first_name: string; last_name: string } | null;
  completions?: CompletionEntry[];
}

const STATUS_PILL: Record<CompletionStatus, { label: string; tone: "warn" | "good" | "bad" } | null> = {
  none: null,
  pending: { label: "Pending Approval", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
};

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
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Which completion is mid-decline, and the reason being typed for it.
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blocking = isTaskBlockingToday(task);
  const isDone = task.completionStatus === "approved";

  async function handleSubmit(photo?: File) {
    // A photo-required task can't be submitted from the checkbox alone —
    // clicking it opens the file picker, and the real submit happens once a
    // file comes back.
    if (task.requires_photo && !photo) {
      fileInputRef.current?.click();
      return;
    }

    setToggling(true);
    setSubmitError(null);

    let res: Response;
    if (photo) {
      const fd = new FormData();
      fd.append("task_id", task.id);
      fd.append("photo", photo);
      res = await fetch("/api/tasks/complete", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
    }

    if (!res.ok) {
      setSubmitError((await res.json().catch(() => ({}))).error ?? "Couldn't submit.");
      setToggling(false);
      return;
    }
    setToggling(false);
    router.refresh();
  }

  async function handleUndo() {
    setToggling(true);
    await fetch("/api/tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, undo: true }),
    });
    setToggling(false);
    router.refresh();
  }

  async function handleReview(completionId: string, status: "approved" | "rejected", note?: string) {
    setReviewing(completionId);
    const res = await fetch("/api/tasks/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completion_id: completionId, status, review_note: note ?? null }),
    });
    setReviewing(null);
    if (!res.ok) {
      setSubmitError((await res.json().catch(() => ({}))).error ?? "Couldn't save that review.");
      return;
    }
    setDeclining(null);
    setDeclineNote("");
    router.refresh();
  }

  // Opens the proof photo in a new tab. The URL is signed and short-lived,
  // so it's fetched on click rather than rendered into the page up front.
  async function openPhoto(completionId: string) {
    const res = await fetch(`/api/tasks/photo/${completionId}`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank", "noopener");
  }

  // For non-TL: checkbox behavior based on status
  const canUndo = !canManage && task.completionStatus === "pending";

  return (
    <div
      className={`border border-[var(--line)] rounded-lg px-4 py-3 transition-all ${
        isDone ? "bg-[var(--paper)]/60 opacity-70" : "bg-[var(--paper-raised)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Completion checkbox (associates only) */}
        {!canManage && (
          <button
            type="button"
            onClick={canUndo ? handleUndo : () => handleSubmit()}
            disabled={toggling || isDone}
            className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-[var(--line)] flex items-center justify-center cursor-pointer hover:border-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={
              task.completionStatus === "pending"
                ? { backgroundColor: "var(--warn)", borderColor: "var(--warn)" }
                : isDone
                  ? { backgroundColor: "var(--accent)", borderColor: "var(--accent)" }
                  : undefined
            }
            title={
              isDone
                ? "Approved — complete"
                : task.completionStatus === "pending"
                  ? "Pending approval — click to undo"
                  : task.completionStatus === "rejected"
                    ? "Rejected — click to re-submit"
                    : "Mark as complete"
            }
          >
            {(task.completionStatus === "pending" || isDone) && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] font-semibold ${isDone ? "line-through text-[var(--muted)]" : "text-[var(--ink)]"}`}>
              {task.title}
            </span>
            {task.assign_to === "all" ? (
              <Pill tone="accent">All members</Pill>
            ) : (
              <Pill tone="muted">{assigneeName ?? "Individual"}</Pill>
            )}
            {blocking && !isDone && <Pill tone="warn">Blocking</Pill>}
            {STATUS_PILL[task.completionStatus] && (
              <Pill tone={STATUS_PILL[task.completionStatus]!.tone}>
                {STATUS_PILL[task.completionStatus]!.label}
              </Pill>
            )}
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
            {task.requires_photo && <span>Photo required</span>}
            {task.requires_approval === false && <span>No approval needed</span>}
          </div>

          {/* Photo-required submit. The checkbox opens this picker; picking a
              file is what actually submits. */}
          {!canManage && task.requires_photo && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleSubmit(f);
              }}
            />
          )}

          {/* The member's own view of a decline — the reason, and what to do
              about it. Mirrors a rejected leave request's review_note. */}
          {!canManage && task.completionStatus === "rejected" && (
            <div className="mt-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-3 py-2">
              <div className="text-[11px] font-bold text-[var(--bad)] uppercase tracking-wider">
                Declined by your Team Leader
              </div>
              {task.myReviewNote && (
                <p className="text-[12.5px] text-[var(--ink)] m-0 mt-1 leading-snug">{task.myReviewNote}</p>
              )}
              <p className="text-[11.5px] text-[var(--muted)] m-0 mt-1">
                {task.requires_photo
                  ? "Tick the box to attach a new photo and re-submit."
                  : "Tick the box to re-submit."}
              </p>
            </div>
          )}

          {!canManage && submitError && (
            <p role="alert" className="text-[12px] text-[var(--bad)] m-0 mt-2">
              {submitError}
            </p>
          )}

          {/* TL: show completions with approve/reject */}
          {canManage && task.completions && task.completions.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1.5">
              {task.completions.map((c) => {
                const name = c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name}` : c.profile_id;
                return (
                  <div key={c.id} className="flex flex-col gap-1 text-[11.5px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--ink)] font-medium">{name}</span>
                      {c.photo_path && (
                        <button
                          type="button"
                          onClick={() => openPhoto(c.id)}
                          className="text-[10.5px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
                        >
                          View photo
                        </button>
                      )}
                      {c.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <Pill tone="warn">Pending</Pill>
                          <button
                            type="button"
                            onClick={() => handleReview(c.id, "approved")}
                            disabled={reviewing === c.id}
                            className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[var(--good)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeclining(declining === c.id ? null : c.id);
                              setDeclineNote("");
                            }}
                            disabled={reviewing === c.id}
                            className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <Pill tone={c.status === "approved" ? "good" : "bad"}>
                          {c.status === "approved" ? "Approved" : "Declined"}
                        </Pill>
                      )}
                    </div>

                    {/* A decline needs a reason — the member only sees this
                        note, so "Declined" with nothing attached leaves them
                        guessing. The API rejects an empty one too. */}
                    {declining === c.id && (
                      <div className="flex flex-col gap-1.5 pl-1 pt-1">
                        <textarea
                          value={declineNote}
                          onChange={(e) => setDeclineNote(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="Why are you declining? The member will see this."
                          className="w-full max-w-[380px] px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper)] text-[12px]"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleReview(c.id, "rejected", declineNote.trim())}
                            disabled={reviewing === c.id || !declineNote.trim()}
                            className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Confirm decline
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeclining(null)}
                            className="px-2 py-0.5 rounded text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {c.status === "rejected" && c.review_note && (
                      <span className="text-[11px] text-[var(--muted)] pl-1">Reason: {c.review_note}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canManage && submitError && (
            <p role="alert" className="text-[12px] text-[var(--bad)] m-0 mt-2">
              {submitError}
            </p>
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
