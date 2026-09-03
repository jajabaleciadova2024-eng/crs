"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { todayInManila } from "@/lib/scheduleDates";


const TAG_TONE: Record<string, string> = {
  neutral: "bg-[var(--paper)] text-[var(--muted)] border-[var(--line)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-transparent",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)] border-transparent",
  bad: "bg-[var(--bad-soft)] text-[var(--bad)] border-transparent",
  good: "bg-[var(--good-soft)] text-[var(--good)] border-transparent",
};

// A tag carries a small glyph rather than the generic Pill's dot, so
// "Blocking" and "Photo required" are distinguishable at a glance instead of
// reading as three identical chips with different words in them.
function Tag({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: keyof typeof TAG_TONE;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-bold tracking-wide whitespace-nowrap leading-none ${TAG_TONE[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

function TagIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Whole days from today (Manila) to `dateStr`. Both are plain YYYY-MM-DD, so
// this is calendar-day arithmetic — no time-of-day, no timezone drift.
function daysUntil(dateStr: string): number {
  const a = Date.UTC(...(todayInManila().split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(dateStr.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000);
}

// "Sep 3, 2026" — the raw ISO string a date input produces is precise and
// unreadable at a glance.
function formatDeadline(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// How the deadline should read and feel: overdue is bad, the next few days
// are a warning, anything further out is just information.
function deadlineState(dateStr: string): { label: string; tone: "bad" | "warn" | "neutral" } {
  const n = daysUntil(dateStr);
  if (n < 0) return { label: n === -1 ? "Overdue by 1 day" : `Overdue by ${-n} days`, tone: "bad" };
  if (n === 0) return { label: "Due today", tone: "bad" };
  if (n === 1) return { label: "Due tomorrow", tone: "warn" };
  if (n <= 3) return { label: `Due in ${n} days`, tone: "warn" };
  return { label: `Due in ${n} days`, tone: "neutral" };
}

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
  // Photo-proof flow: the member picks a file, sees what they picked, and
  // then submits deliberately. Nothing is uploaded until they press Submit.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPanelRef = useRef<HTMLDivElement>(null);
  // Briefly rings the attach panel when the checkbox sends you to it, so the
  // click visibly lands somewhere instead of appearing to do nothing.
  const [pulse, setPulse] = useState(false);

  function focusPhotoPanel() {
    photoPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);
  }

  function choosePhoto(file: File) {
    // Revoke the previous object URL before replacing it, or each re-pick
    // leaks a blob for the lifetime of the page.
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setSubmitError(null);
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
  }
  const blocking = isTaskBlockingToday(task);
  const isDone = task.completionStatus === "approved";

  async function handleSubmit(photo?: File) {
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
    clearPhoto();
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
  // A photo is still outstanding: this task wants one, and the member hasn't
  // submitted yet (a decline puts them back in this state).
  const needsPhoto =
    !canManage &&
    !!task.requires_photo &&
    (task.completionStatus === "none" || task.completionStatus === "rejected");

  return (
    <div
      className={`border border-[var(--line)] rounded-lg px-4 py-3 transition-all ${
        isDone ? "bg-[var(--paper)]/60 opacity-70" : "bg-[var(--paper-raised)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Completion checkbox (associates only). Bigger than a bare 20px
            square, with a hover ring and a press animation, so it reads as
            something you click rather than a status dot. On a photo task it
            stays live and jumps to the attach panel — a disabled grey box
            just looks broken. */}
        {!canManage && (
          <button
            type="button"
            onClick={canUndo ? handleUndo : needsPhoto ? focusPhotoPanel : () => handleSubmit()}
            disabled={toggling || isDone}
            aria-label={
              isDone
                ? "Completed and approved"
                : canUndo
                  ? "Undo submission"
                  : needsPhoto
                    ? "Attach the required photo to complete this task"
                    : "Mark as complete"
            }
            className="mt-[1px] shrink-0 w-[22px] h-[22px] rounded-md border-2 border-[var(--line)] flex items-center justify-center cursor-pointer transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:bg-transparent"
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
                  : needsPhoto
                    ? "Attach the required photo below"
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
              <Tag
                tone="accent"
                icon={
                  <TagIcon>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                    <circle cx="17" cy="8.5" r="2.2" />
                    <path d="M15.7 12.2c2.5.3 4.4 2.2 4.7 4.8" />
                  </TagIcon>
                }
              >
                All members
              </Tag>
            ) : (
              <Tag
                icon={
                  <TagIcon>
                    <circle cx="12" cy="8" r="3.4" />
                    <path d="M5 20a7 7 0 0 1 14 0" />
                  </TagIcon>
                }
              >
                {assigneeName ?? "Individual"}
              </Tag>
            )}
            {blocking && !isDone && (
              <Tag
                tone="warn"
                icon={
                  <TagIcon>
                    <path d="M12 3 2.5 20h19L12 3z" />
                    <path d="M12 10v4M12 17.2v.1" />
                  </TagIcon>
                }
              >
                Blocking
              </Tag>
            )}
            {task.requires_photo && (
              <Tag
                icon={
                  <TagIcon>
                    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.4-2h7.8l1.4 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
                    <circle cx="12" cy="13" r="3.2" />
                  </TagIcon>
                }
              >
                Photo required
              </Tag>
            )}
            {STATUS_PILL[task.completionStatus] && (
              <Tag tone={STATUS_PILL[task.completionStatus]!.tone}>
                {STATUS_PILL[task.completionStatus]!.label}
              </Tag>
            )}
          </div>

          {task.description && (
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed whitespace-pre-wrap break-words">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[11px] text-[var(--muted)]">
            {task.deadline &&
              (() => {
                // Once it's approved the countdown is history — showing
                // "Overdue by 4 days" on a finished task is just noise.
                const state = isDone ? null : deadlineState(task.deadline);
                const color =
                  state?.tone === "bad"
                    ? "var(--bad)"
                    : state?.tone === "warn"
                      ? "var(--warn)"
                      : "var(--muted)";
                return (
                  <span className="inline-flex items-center gap-1.5" style={{ color }}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <rect x="3.5" y="5" width="17" height="16" rx="2" />
                      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
                    </svg>
                    <span className="font-semibold">{formatDeadline(task.deadline)}</span>
                    {state && (
                      <span className={state.tone === "neutral" ? "" : "font-bold"}>· {state.label}</span>
                    )}
                  </span>
                );
              })()}
            {task.deadline && task.blocker_days_before > 0 && (
              <span>Blocks {task.blocker_days_before}d before</span>
            )}
            {!task.deadline && <span>No deadline — blocks until done</span>}
            {task.requires_approval === false && <span>No approval needed</span>}
          </div>

          {/* Says out loud what the checkbox does. A bare square carries no
              label, which is fine on a to-do app people already know and
              poor on a page someone opens twice a month. */}
          {!canManage && !needsPhoto && task.completionStatus === "none" && (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={toggling}
              className="mt-2 text-[12px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
            >
              {toggling ? "Submitting…" : "Mark as complete"}
            </button>
          )}
          {!canManage && canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={toggling}
              className="mt-2 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--ink)] hover:underline cursor-pointer disabled:opacity-50"
            >
              Undo submission
            </button>
          )}

          {/* Photo proof. Compact and left-aligned — the previous version
              stretched the full card width, which stranded the button on the
              far right with a band of empty space between it and the text. */}
          {needsPhoto && (
            <div
              ref={photoPanelRef}
              className={`mt-2.5 w-fit max-w-full rounded-lg border px-3 py-2.5 transition-all duration-300 ${
                pulse
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/60"
                  : "border-[var(--line)] bg-[var(--paper)]/70"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) choosePhoto(f);
                }}
              />

              {!photo ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] leading-none shrink-0" aria-hidden="true">
                    📷
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--ink)] leading-tight">
                      Photo proof required
                    </div>
                    <div className="text-[11px] text-[var(--muted)] leading-tight mt-0.5">
                      Attach an image, then submit.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-1 shrink-0 px-2.5 py-1.5 rounded-md text-[11.5px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                  >
                    Choose photo
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview ?? ""}
                    alt=""
                    className="w-11 h-11 rounded-md object-cover border border-[var(--line)] shrink-0"
                  />
                  <div className="min-w-0 max-w-[180px]">
                    <div className="text-[12px] text-[var(--ink)] truncate leading-tight">{photo.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={toggling}
                        className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={clearPhoto}
                        disabled={toggling}
                        className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSubmit(photo)}
                    disabled={toggling}
                    className="ml-1 shrink-0 px-2.5 py-1.5 rounded-md text-[11.5px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {toggling ? "Submitting…" : "Submit"}
                  </button>
                </div>
              )}
            </div>
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
