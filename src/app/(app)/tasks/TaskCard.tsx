"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import Linkify from "@/components/Linkify";
import { isTaskBlockingToday } from "@/lib/taskBlocking";
import { todayInManila } from "@/lib/scheduleDates";
import { taskAppliesTo } from "@/lib/taskAssignment";
import { pokeCooldownRemaining, formatCooldown, POKE_COOLDOWN_HOURS } from "@/lib/pokeCooldown";
import { useNowMinute } from "@/lib/useNowMinute";
import {
  shrinkImagesForUpload,
  readUploadError,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/imageUpload";


const MAX_PHOTOS = 6;
// What a phone may hand us, not what gets sent. Everything picked is
// re-encoded down before it leaves the browser, so the old 10MB ceiling was
// turning away 48-megapixel shots the app could handle perfectly well —
// while the member had no way to make the file smaller themselves.
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

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
  /** Every proof image, in attachment order. photo_path mirrors the first. */
  photo_paths?: string[] | null;
  review_note: string | null;
  completion_date: string | null;
  profiles: { first_name: string; last_name: string } | null;
}

export type RosterMember = { id: string; first_name: string; last_name: string };

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assign_to: string;
  /** Members excused from this task — not assigned, not blocked, not nudged. */
  excluded_ids?: string[] | null;
  blocks_schedule?: boolean;
  blocks_leave?: boolean;
  blocker_days_before: number;
  completionStatus: CompletionStatus;
  requires_approval?: boolean;
  requires_photo?: boolean;
  requires_completion_date?: boolean;
  // The Team Leader's reason, when THIS viewer's submission was declined.
  myReviewNote?: string | null;
  created_at: string;
  profiles?: { first_name: string; last_name: string } | null;
  completions?: CompletionEntry[];
  /** When each member was last nudged about THIS task, so the button can
      show the cooldown rather than looking live and then being refused. */
  lastPokedAt?: Record<string, string>;
}

// One line of the Team Leader's roster table: an assignee and whatever they
// have (or have not) submitted.
type RosterRow = {
  profileId: string;
  name: string;
  completion: CompletionEntry | null;
};

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
  roster,
  onEdit,
  onDelete,
}: {
  task: TaskData;
  canManage: boolean;
  assigneeName?: string;
  /** Active members, so the Team Leader's table can list everyone the task
      is for — including the people who have submitted nothing. */
  roster?: RosterMember[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  // Re-encoding several phone photos takes a second or two on a mid-range
  // handset, and it happens after the press. Saying which step is running
  // keeps that from reading as a stuck button.
  const [preparing, setPreparing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Which completion is mid-decline, and the reason being typed for it.
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  // Nudges: keyed by profile id for one person, or "all" for the whole
  // outstanding set, so each button reports its own state.
  const [poking, setPoking] = useState<string | null>(null);
  const [poked, setPoked] = useState<Record<string, boolean>>({});
  const [pokeError, setPokeError] = useState<string | null>(null);
  // Collapsed by default. A task's description is a set of instructions —
  // several lines of them here — and with a handful of tasks open at once
  // the page became a wall of text you had to scroll past to find the one
  // you wanted. The header carries enough to choose from: title, what it
  // blocks, the deadline, and how many people are waiting on you.
  const [expanded, setExpanded] = useState(false);
  // Ticks once a minute; 0 until mounted, so server and client agree on the
  // first render. The cooldown is measured in hours — a per-minute clock is
  // far more precision than it needs.
  const nowMs = useNowMinute();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Photo-proof flow: the member picks a file, sees what they picked, and
  // then submits deliberately. Nothing is uploaded until they press Submit.
  // The preview URL is created WITH the file, in the event handler that
  // picked it — not derived in an effect. An object URL is a resource, not
  // derived state: making it in an effect meant a cascading render on every
  // pick, and it has to be revoked by hand either way.
  type PickedPhoto = { file: File; url: string };
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPanelRef = useRef<HTMLDivElement>(null);
  // Briefly rings the attach panel when the checkbox sends you to it, so the
  // click visibly lands somewhere instead of appearing to do nothing.
  const [pulse, setPulse] = useState(false);
  // "When did you actually do it?" — only asked when the task requires it.
  const [completionDate, setCompletionDate] = useState("");
  type ProofPhoto = { viewUrl: string; downloadUrl: string; fileName: string };
  const [photoView, setPhotoView] = useState<
    | { state: "closed" }
    | { state: "loading" }
    // A submission can carry several images, so the viewer holds the whole
    // set and which one is on screen rather than a single URL.
    | { state: "ready"; photos: ProofPhoto[]; index: number }
    | { state: "error"; message: string }
  >({ state: "closed" });

  function focusPhotoPanel() {
    // The panel lives in the collapsed half of the card, so open it first —
    // otherwise the checkbox appears to do nothing at all. One frame is
    // enough for the panel to exist before scrolling to it.
    setExpanded(true);
    requestAnimationFrame(() => {
      photoPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);
  }

  function choosePhotos(picked: FileList | null) {
    if (!picked) return;
    setSubmitError(null);
    const incoming = [...picked];
    const tooBig = incoming.find((f) => f.size > MAX_SOURCE_BYTES);
    if (tooBig) {
      setSubmitError(`"${tooBig.name}" is too large (25MB max).`);
      return;
    }
    const notImage = incoming.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      setSubmitError("Only images can be attached.");
      return;
    }
    setPhotos((prev) => {
      // Adds rather than replaces: picking a second time on a phone, once
      // per photo, is the normal way to attach two.
      const room = MAX_PHOTOS - prev.length;
      if (incoming.length > room) {
        setSubmitError(`Up to ${MAX_PHOTOS} photos — the rest were left out.`);
      }
      const taken = incoming.slice(0, Math.max(0, room));
      return [...prev, ...taken.map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const gone = prev[index];
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearPhotos() {
    setPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  }

  // Last resort: whatever is still picked when the card goes away. Removing
  // and clearing revoke as they go, so this only catches a navigation
  // mid-attach. The ref keeps the effect free of a `photos` dependency,
  // which would otherwise revoke live URLs on every pick.
  const photosRef = useRef<PickedPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );
  // How many proofs a submission carries. photo_paths is the truth;
  // photo_path is the single upload from before multiple were allowed.
  const photoCount = (c?: { photo_path: string | null; photo_paths?: string[] | null } | null) =>
    c?.photo_paths?.length ? c.photo_paths.length : c?.photo_path ? 1 : 0;

  const blocking = isTaskBlockingToday(task);
  // What this task actually locks. "Blocking" alone said nothing about
  // which, and now that it can be one, both, or neither, it has to.
  const blocksSchedule = task.blocks_schedule !== false;
  const blocksLeave = task.blocks_leave !== false;
  const blockLabel =
    blocksSchedule && blocksLeave
      ? "Blocks schedule & leave"
      : blocksSchedule
        ? "Blocks schedule"
        : blocksLeave
          ? "Blocks leave"
          : null;
  const isDone = task.completionStatus === "approved";

  // Every person this task is for, with their submission attached if they
  // made one.
  //
  // Built from the ROSTER, not from the completions table. Listing only the
  // rows that exist meant somebody who submitted and then withdrew — or who
  // never started — simply was not on screen at all, so the Team Leader had
  // no way to tell "nobody has done this" apart from "everybody has". A
  // notification saying a task was submitted with nothing to match it on
  // this page is exactly that gap.
  const rosterRows: RosterRow[] = (() => {
    if (!canManage) return [];
    const completionFor = new Map((task.completions ?? []).map((c) => [c.profile_id, c]));
    const members = roster ?? [];
    const base = members.filter((m) => taskAppliesTo(task, m.id));
    const rows: RosterRow[] = base.map((m) => ({
      profileId: m.id,
      name: `${m.first_name} ${m.last_name}`,
      completion: completionFor.get(m.id) ?? null,
    }));
    // Anyone who submitted but is no longer on the roster (deactivated, role
    // changed) still has work waiting on a decision — never drop them.
    const seen = new Set(rows.map((r) => r.profileId));
    for (const c of task.completions ?? []) {
      if (seen.has(c.profile_id)) continue;
      rows.push({
        profileId: c.profile_id,
        name: c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name}` : c.profile_id,
        completion: c,
      });
    }
    // Waiting-on-you first, then declined, then not-submitted, then done —
    // the order the Team Leader actually works through them in.
    const rank = (r: RosterRow) =>
      r.completion?.status === "pending" ? 0
      : r.completion?.status === "rejected" ? 1
      : !r.completion ? 2
      : 3;
    return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  })();

  const awaitingReview = rosterRows.filter((r) => r.completion?.status === "pending").length;
  const notSubmitted = rosterRows.filter((r) => !r.completion).length;
  // Who still owes work: nothing submitted, or submitted and declined. The
  // people a nudge is actually for.
  const owingIds = rosterRows
    .filter((r) => !r.completion || r.completion.status === "rejected")
    .map((r) => r.profileId);
  // Nudges are once per member per task per cooldown window, so the bulk
  // button offers only the people it can actually reach right now.
  // Before the clock is live, treat everyone as nudgeable rather than
  // guessing: the route re-checks and refuses with the remaining time, so
  // the worst case is one honest error message instead of a button that
  // flickers between states on load.
  const cooldownFor = (profileId: string) =>
    nowMs ? pokeCooldownRemaining(task.lastPokedAt?.[profileId], nowMs) : 0;
  const nudgeableIds = owingIds.filter((id) => cooldownFor(id) === 0);

  async function handleSubmit(attachments: File[] = []) {
    if (task.requires_completion_date && !completionDate) {
      setSubmitError("Pick the date you completed this.");
      return;
    }
    setToggling(true);
    setSubmitError(null);

    try {
      let res: Response;
      if (attachments.length > 0) {
        // Phone photos are 3–8MB each and the request body is capped well
        // below that, so a straight upload of what was picked is refused by
        // the platform before the route ever sees it — which is what the
        // bare "Couldn't submit." used to be. Re-encode them to fit first.
        setPreparing(true);
        const { files, error: tooBig } = await shrinkImagesForUpload(attachments);
        setPreparing(false);
        if (tooBig) {
          setSubmitError(tooBig);
          setToggling(false);
          return;
        }

        const fd = new FormData();
        fd.append("task_id", task.id);
        // One entry per file under the same key; the route reads them with
        // getAll, so a single photo still posts exactly as it used to.
        for (const f of files) fd.append("photo", f);
        if (completionDate) fd.append("completion_date", completionDate);
        res = await fetch("/api/tasks/complete", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: task.id, completion_date: completionDate || null }),
        });
      }

      if (!res.ok) {
        setSubmitError(await readUploadError(res, "Couldn't submit."));
        setToggling(false);
        return;
      }
      setToggling(false);
      clearPhotos();
      router.refresh();
    } catch {
      // A dropped connection rejects the fetch outright. Unhandled, that
      // left the button spinning on "Submitting…" with nothing to read.
      setPreparing(false);
      setSubmitError(NETWORK_ERROR_MESSAGE);
      setToggling(false);
    }
  }

  async function handleUndo() {
    setToggling(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, undo: true }),
      });
      // A refused undo used to look exactly like a successful one — the
      // card just came back unchanged after the refresh.
      if (!res.ok) setSubmitError(await readUploadError(res, "Couldn't undo that submission."));
    } catch {
      setSubmitError(NETWORK_ERROR_MESSAGE);
    }
    setToggling(false);
    router.refresh();
  }

  async function handleReview(completionId: string, status: "approved" | "rejected", note?: string) {
    setReviewing(completionId);
    let res: Response;
    try {
      res = await fetch("/api/tasks/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completion_id: completionId, status, review_note: note ?? null }),
      });
    } catch {
      setReviewing(null);
      setSubmitError(NETWORK_ERROR_MESSAGE);
      return;
    }
    setReviewing(null);
    if (!res.ok) {
      setSubmitError(await readUploadError(res, "Couldn't save that review."));
      return;
    }
    setDeclining(null);
    setDeclineNote("");
    router.refresh();
  }

  // Nudge whoever still owes this task. The API re-checks and drops anyone
  // already approved or awaiting review, so a stale button can't spam
  // somebody who has since submitted.
  async function poke(profileIds: string[], key: string) {
    setPoking(key);
    setPokeError(null);
    let res: Response;
    try {
      res = await fetch("/api/tasks/poke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, profile_ids: profileIds }),
      });
    } catch {
      setPoking(null);
      setPokeError(NETWORK_ERROR_MESSAGE);
      return;
    }
    setPoking(null);
    if (!res.ok) {
      setPokeError(await readUploadError(res, "Couldn't send that nudge."));
      return;
    }
    setPoked((p) => ({ ...p, [key]: true }));
  }

  // Opens the proof photo in a viewer on this page. The signed URL is
  // short-lived, so it is fetched on click rather than baked into the page.
  //
  // Deliberately NOT window.open: that ran after an await, which loses the
  // user-gesture context, so popup blockers swallowed it and the click did
  // nothing at all. Every failure was invisible for the same reason — the
  // old code returned silently on !res.ok — so a viewer plus a real error
  // message is the fix for both.
  async function openPhoto(completionId: string) {
    setPhotoView({ state: "loading" });
    try {
      const res = await fetch(`/api/tasks/photo/${completionId}`);
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error ?? "Couldn't open the photo.";
        setPhotoView({ state: "error", message: msg });
        return;
      }
      const body = await res.json();
      // `photos` is the current shape; the single-photo fields are the
      // fallback for a response from before this deploy.
      const photos: ProofPhoto[] = body.photos?.length
        ? body.photos
        : [
            {
              viewUrl: body.viewUrl ?? body.url,
              downloadUrl: body.downloadUrl ?? body.viewUrl ?? body.url,
              fileName: body.fileName ?? "task-proof",
            },
          ];
      setPhotoView({ state: "ready", photos, index: 0 });
    } catch {
      setPhotoView({ state: "error", message: "Couldn't reach the server." });
    }
  }

  // For non-TL: checkbox behavior based on status
  const canUndo = !canManage && task.completionStatus === "pending";
  // A photo is still outstanding: this task wants one, and the member hasn't
  // submitted yet (a decline puts them back in this state).
  const needsPhoto =
    !canManage &&
    !!task.requires_photo &&
    (task.completionStatus === "none" || task.completionStatus === "rejected");
  const needsDate =
    !canManage &&
    !!task.requires_completion_date &&
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
            // Deliberately NOT an undo control while a submission is
            // pending. One stray tap on an already-ticked box silently
            // deleted the submission and left the Team Leader holding a
            // "submitted a task for approval" notification with nothing
            // behind it — the member believed it was sent, the Team Leader
            // had nothing to approve, and neither could see why. Withdrawing
            // is still possible, but only through the labelled button below.
            onClick={
              canUndo
                ? undefined
                : needsPhoto || (needsDate && !completionDate)
                  ? focusPhotoPanel
                  : () => handleSubmit()
            }
            disabled={toggling || isDone || canUndo}
            aria-label={
              isDone
                ? "Completed and approved"
                : canUndo
                  ? "Submitted — waiting on your Team Leader"
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
          {/* The whole header strip toggles — the title row AND the line of
              facts under it. Anything a collapsed card shows is part of the
              same target, so there is no dead strip to hit by accident; a
              chevron alone would be a 13px target on a phone. */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpanded((v) => !v);
              }
            }}
            className="cursor-pointer select-none"
          >
            <div className="flex items-center gap-2 flex-wrap">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`shrink-0 text-[var(--muted)] transition-transform duration-150 ${
                expanded ? "rotate-90" : ""
              }`}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
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
            {blocking && !isDone && blockLabel && (
              <Tag
                tone="warn"
                icon={
                  <TagIcon>
                    <path d="M12 3 2.5 20h19L12 3z" />
                    <path d="M12 10v4M12 17.2v.1" />
                  </TagIcon>
                }
              >
                {blockLabel}
              </Tag>
            )}
            {task.requires_completion_date && (
              <Tag
                icon={
                  <TagIcon>
                    <rect x="3.5" y="5" width="17" height="16" rx="2" />
                    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
                  </TagIcon>
                }
              >
                Date required
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
            {/* Collapsed, this line is the whole card — it has to say
                whether anything here needs the Team Leader. */}
            {canManage && awaitingReview > 0 && (
              <span className="text-[var(--warn)] font-bold">{awaitingReview} awaiting review</span>
            )}
            {canManage && notSubmitted > 0 && <span>{notSubmitted} not submitted</span>}
          </div>
          </div>

          {expanded && task.description && (
            <p className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed whitespace-pre-wrap break-words">
              <Linkify text={task.description} />
            </p>
          )}

          {/* Everything below the header is the detail: the description,
              the member's own submit controls, and the Team Leader's
              roster table. Hidden until the card is opened. */}
          {expanded && (
            <>
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
                {preparing ? "Preparing photos…" : toggling ? "Submitting…" : "Mark as complete"}
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

            {needsDate && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`cdate-${task.id}`}
                  className="text-[11.5px] font-semibold text-[var(--ink)]"
                >
                  Completed on
                </label>
                <input
                  id={`cdate-${task.id}`}
                  type="date"
                  value={completionDate}
                  max={todayInManila()}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[12px] text-[var(--ink)]"
                />
              </div>
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
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    choosePhotos(e.target.files);
                    // Cleared, or picking the same file twice running is a
                    // no-op because the input's value never changed.
                    e.target.value = "";
                  }}
                />

                {photos.length === 0 ? (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] leading-none shrink-0" aria-hidden="true">
                      📷
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[var(--ink)] leading-tight">
                        Photo proof required
                      </div>
                      <div className="text-[11px] text-[var(--muted)] leading-tight mt-0.5">
                        Attach one or more images, then submit.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="ml-1 shrink-0 px-2.5 py-1.5 rounded-md text-[11.5px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    >
                      Choose photos
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Thumbnails wrap instead of sitting in a row: six of
                        them beside a Submit button does not fit a phone. */}
                    <div className="flex flex-wrap gap-1.5">
                      {photos.map((p, i) => (
                        <div key={p.url} className="relative w-14 h-14 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.file.name}
                            className="w-full h-full rounded-md object-cover border border-[var(--line)]"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            disabled={toggling}
                            aria-label={`Remove ${p.file.name}`}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/75 text-white text-[12px] leading-none flex items-center justify-center hover:bg-black cursor-pointer disabled:opacity-50"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-[var(--muted)]">
                        {photos.length} photo{photos.length !== 1 ? "s" : ""} attached
                      </span>
                      {photos.length < MAX_PHOTOS && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={toggling}
                          className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Add more
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={clearPhotos}
                        disabled={toggling}
                        className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Remove all
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmit(photos.map((p) => p.file))}
                        disabled={toggling}
                        className="ml-auto shrink-0 px-2.5 py-1.5 rounded-md text-[11.5px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {preparing ? "Preparing…" : toggling ? "Submitting…" : "Submit"}
                      </button>
                    </div>
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

            {/* TL: every assignee in a row, with what they owe or submitted.
                Columns, not a run-on line: name, when they sent it, the date
                they say they did the work, their proof, where it stands, and
                the decision. Those were six different things crammed onto one
                wrapping line before, which is why a Pending row read the same
                as an Approved one at a glance. */}
            {canManage && rosterRows.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1.5 text-[11px]">
                  <span className="uppercase tracking-wider text-[var(--muted)] font-semibold">
                    Members ({rosterRows.length})
                  </span>
                  {awaitingReview > 0 && (
                    <span className="text-[var(--warn)] font-bold">{awaitingReview} awaiting your review</span>
                  )}
                  {notSubmitted > 0 && (
                    <span className="text-[var(--muted)]">{notSubmitted} not submitted</span>
                  )}
                  {owingIds.length > 0 &&
                    (nudgeableIds.length === 0 && !poked.all ? (
                      <span className="ml-auto text-[10.5px] text-[var(--muted)]">All nudged recently</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => poke(nudgeableIds, "all")}
                        disabled={poking === "all"}
                        className="ml-auto px-2 py-0.5 rounded text-[10.5px] font-bold border border-[var(--line)] text-[var(--accent-strong)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
                      >
                        {poking === "all"
                          ? "Nudging\u2026"
                          : poked.all
                            ? `Nudged ${nudgeableIds.length}`
                            : `Nudge all ${nudgeableIds.length}`}
                      </button>
                    ))}
                </div>

                {pokeError && (
                  <p role="alert" className="text-[11.5px] text-[var(--bad)] m-0 mb-1.5">
                    {pokeError}
                  </p>
                )}

                <div className="overflow-x-auto scroll-shadow-x -mx-1 px-1">
                  <table className="w-full text-[12px] border-collapse min-w-[560px]">
                    <thead>
                      <tr>
                        {["Member", "Submitted", "Date done", "Proof", "Status", "Action"].map((h) => (
                          <th
                            key={h}
                            className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 py-1.5 border-b border-[var(--line)] whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rosterRows.map((r) => {
                        const c = r.completion;
                        const st = c?.status ?? "none";
                        return (
                          <tr
                            key={r.profileId}
                            className={st === "pending" ? "bg-[var(--warn-soft)]/25" : undefined}
                          >
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 text-[var(--ink)] font-medium whitespace-nowrap">
                              {r.name}
                            </td>
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 text-[var(--muted)] whitespace-nowrap">
                              {c?.completed_at ? formatDeadline(c.completed_at.slice(0, 10)) : "\u2014"}
                            </td>
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 text-[var(--muted)] whitespace-nowrap">
                              {c?.completion_date ? formatDeadline(c.completion_date) : "\u2014"}
                            </td>
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 whitespace-nowrap">
                              {c && photoCount(c) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openPhoto(c.id)}
                                  className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
                                >
                                  {/* The count is on the link, so the Team
                                      Leader knows there is a second image to
                                      page to before opening it. */}
                                  View{photoCount(c) > 1 ? ` (${photoCount(c)})` : ""}
                                </button>
                              ) : task.requires_photo && c ? (
                                <span className="text-[10.5px] text-[var(--muted)] italic">none</span>
                              ) : (
                                <span className="text-[var(--muted)]">{"\u2014"}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 whitespace-nowrap">
                              {st === "pending" ? (
                                <Pill tone="warn">Awaiting review</Pill>
                              ) : st === "approved" ? (
                                <Pill tone="good">Approved</Pill>
                              ) : st === "rejected" ? (
                                <Pill tone="bad">Declined</Pill>
                              ) : (
                                <span className="text-[11px] text-[var(--muted)]">Not submitted</span>
                              )}
                            </td>
                            <td className="px-2 py-2 border-b border-[var(--line)]/60 whitespace-nowrap">
                              {!c || st === "rejected" ? (
                                poked[r.profileId] || poked.all ? (
                                  <span className="text-[10.5px] text-[var(--good)] font-bold">Nudged</span>
                                ) : cooldownFor(r.profileId) > 0 ? (
                                  <span
                                    className="text-[10.5px] text-[var(--muted)]"
                                    title={`Nudged recently \u2014 ${POKE_COOLDOWN_HOURS}h between nudges`}
                                  >
                                    Nudge in {formatCooldown(cooldownFor(r.profileId))}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => poke([r.profileId], r.profileId)}
                                    disabled={poking === r.profileId}
                                    className="px-2 py-0.5 rounded text-[10.5px] font-bold border border-[var(--line)] text-[var(--accent-strong)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-50"
                                  >
                                    {poking === r.profileId ? "\u2026" : "Nudge"}
                                  </button>
                                )
                              ) : c && st === "pending" ? (
                                declining === c.id ? (
                                  <span className="text-[10.5px] text-[var(--muted)]">deciding\u2026</span>
                                ) : (
                                  <span className="flex items-center gap-1">
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
                                        setDeclining(c.id);
                                        setDeclineNote("");
                                      }}
                                      disabled={reviewing === c.id}
                                      className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                                    >
                                      Decline
                                    </button>
                                  </span>
                                )
                              ) : (
                                <span className="text-[var(--muted)]">{"\u2014"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* A decline needs a reason \u2014 the member only sees this note,
                    so "Declined" with nothing attached leaves them guessing.
                    The API rejects an empty one too. */}
                {rosterRows.map((r) =>
                  r.completion && declining === r.completion.id ? (
                    <div key={r.completion.id} className="flex flex-col gap-1.5 mt-2">
                      <span className="text-[11.5px] text-[var(--ink)] font-semibold">
                        Declining {r.name}&apos;s submission
                      </span>
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
                          onClick={() => handleReview(r.completion!.id, "rejected", declineNote.trim())}
                          disabled={reviewing === r.completion.id || !declineNote.trim()}
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
                  ) : null,
                )}

                {rosterRows
                  .filter((r) => r.completion?.status === "rejected" && r.completion.review_note)
                  .map((r) => (
                    <div key={r.profileId} className="text-[11px] text-[var(--muted)] mt-1.5">
                      <span className="font-semibold text-[var(--ink)]">{r.name}</span> declined:{" "}
                      {r.completion!.review_note}
                    </div>
                  ))}
              </div>
            )}

            {canManage && submitError && (
              <p role="alert" className="text-[12px] text-[var(--bad)] m-0 mt-2">
                {submitError}
              </p>
            )}
            </>
          )}
        </div>

        {/* Proof-photo viewer. Portaled to <body> so the card's own
            overflow-hidden and stacking context can't clip it.

            A framed modal rather than an image floating on a black wall: the
            controls now have somewhere to live. Download and close sit
            together in the header, as icons, because a proof is opened,
            glanced at, and either saved or dismissed — there is nothing here
            worth a sentence of chrome. */}
        {photoView.state !== "closed" &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
              onClick={() => setPhotoView({ state: "closed" })}
            >
              <div
                className="w-full max-w-3xl max-h-[92vh] my-auto flex flex-col bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-scale-in"
                style={{ boxShadow: "var(--shadow-lg)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] shrink-0">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold truncate">
                    Proof of completion
                    {photoView.state === "ready" && photoView.photos.length > 1 && (
                      <span className="ml-1.5 normal-case tracking-normal text-[var(--ink)]">
                        {photoView.index + 1} of {photoView.photos.length}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Paging only appears when there is more than one — a
                        single proof should not grow two dead arrows. */}
                    {photoView.state === "ready" && photoView.photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoView((v) =>
                              v.state === "ready"
                                ? { ...v, index: (v.index - 1 + v.photos.length) % v.photos.length }
                                : v,
                            )
                          }
                          title="Previous"
                          aria-label="Previous photo"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoView((v) =>
                              v.state === "ready"
                                ? { ...v, index: (v.index + 1) % v.photos.length }
                                : v,
                            )
                          }
                          title="Next"
                          aria-label="Next photo"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      </>
                    )}
                    {photoView.state === "ready" && canManage && (
                      <a
                        href={photoView.photos[photoView.index].downloadUrl}
                        download={photoView.photos[photoView.index].fileName}
                        title="Download"
                        aria-label="Download this photo"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <path d="M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setPhotoView({ state: "closed" })}
                      title="Close"
                      aria-label="Close photo"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* The image is capped against the VIEWPORT, not the modal.
                    max-height:100% only resolves against a parent with a
                    definite height, and this one is auto — so a 300x900
                    proof rendered at full size and burst out of the frame,
                    measured at every width. 92vh matches the modal's own cap
                    less the header and this padding, so the modal still
                    shrinks to a small image instead of always filling the
                    screen. */}
                <div className="flex-1 min-h-0 flex items-center justify-center p-3 bg-[var(--paper)]">
                  {photoView.state === "loading" && (
                    <span className="py-10 text-[13px] text-[var(--muted)]">Opening…</span>
                  )}
                  {photoView.state === "error" && (
                    <p className="py-10 text-[13px] text-[var(--bad)] m-0 font-semibold text-center px-4">
                      {photoView.message}
                    </p>
                  )}
                  {photoView.state === "ready" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photoView.photos[photoView.index].viewUrl}
                      src={photoView.photos[photoView.index].viewUrl}
                      alt={`Task proof ${photoView.index + 1} of ${photoView.photos.length}`}
                      className="max-w-full object-contain rounded"
                      style={{ maxHeight: "calc(92vh - 72px)" }}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* TL edit/delete actions */}
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            {/* One task per file, so the download lives on the task rather
                than anywhere that could imply a combined export. */}
            <a
              href={`/api/tasks/${task.id}/export`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent-strong)] transition-colors cursor-pointer"
              title={`Export "${task.title}" as CSV`}
              aria-label="Export this task as CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5M12 15V3" />
              </svg>
            </a>
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
