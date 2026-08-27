"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pill, Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import { formatLeaveRanges, type LeaveDateRange } from "@/lib/leaveFormat";
import EditLeaveRequestForm from "./EditLeaveRequestForm";
import DocumentUpload, { DocumentLinks } from "./DocumentUpload";
import type { LeaveStatus } from "@/lib/database.types";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

type Range = LeaveDateRange;

export type QueueRequest = {
  id: string;
  associate_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  document_path: string | null;
  flagged_conflict: boolean;
  review_note: string | null;
  final_rejection: boolean;
  is_half_day: boolean;
  leave_request_ranges: Range[];
  profiles: { first_name: string; last_name: string; avatar_url?: string | null } | null;
};

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

// Compact icon-only action button for the Actions column. Labelled buttons
// (Approve / Reject / Delete) wrapped onto separate lines in this narrow
// column; icons keep all three on one row. The label is exposed as both
// `title` and `aria-label` so hover and screen readers still get it.
const ICON_TONE = {
  good: "text-[var(--good)] hover:bg-[var(--good-soft,var(--accent-soft))] hover:border-[var(--good)]",
  bad: "text-[var(--bad)] hover:bg-[var(--bad-soft,var(--accent-soft))] hover:border-[var(--bad)]",
  muted: "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:border-[var(--line)] hover:text-[var(--ink)]",
} as const;

function IconAction({
  tone,
  label,
  disabled,
  onClick,
  children,
}: {
  tone: keyof typeof ICON_TONE;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${ICON_TONE[tone]}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

export default function LeaveQueueTable({
  requests,
  leaveTypeConfigs,
  requireReason,
  viewerId,
  canViewAll,
  canManage,
}: {
  requests: QueueRequest[];
  leaveTypeConfigs: LeaveTypeConfig[];
  requireReason: boolean;
  viewerId: string;
  canViewAll: boolean;
  canManage: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<QueueRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<QueueRequest | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Approving a pre-approved-type (Sick/Bereavement) request that has no
  // document yet — the Team Leader can override, but has to leave a note
  // explaining why (same shape as the reject-note requirement above), so
  // there's still a deliberate, auditable trail instead of a bare bypass
  // button.
  const [approvingRequest, setApprovingRequest] = useState<QueueRequest | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const colCount = 4 + (canViewAll ? 1 : 0) + 2; // Type, Dates, Reason, Status + Associate? + Actions/Document

  function decide(id: string, status: "approved" | "rejected", note?: string, final?: boolean, onDone?: (ok: boolean, error?: string) => void) {
    setPendingId(id);
    startTransition(async () => {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, final }),
      });
      setPendingId(null);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onDone?.(false, body.error);
        return;
      }
      onDone?.(true);
      router.refresh();
    });
  }

  // Reopenable: can still flip back to Approve/Reject later if a new
  // document comes in. Final: ends the cycle for good, regardless of what
  // gets uploaded afterward -- see 0012_leave_final_rejection.sql.
  function submitReject(final: boolean) {
    if (!rejectingRequest || !rejectNote.trim()) return;
    decide(rejectingRequest.id, "rejected", rejectNote.trim(), final, (ok, error) => {
      if (!ok) {
        setRejectError(error ?? "Couldn't reject that request.");
        return;
      }
      setRejectingRequest(null);
      setRejectNote("");
      setRejectError(null);
    });
  }

  // Team-Leader override: approve a pre-approved-type request that has no
  // document attached yet, with a required note explaining why.
  function submitApproveWithoutDocument() {
    if (!approvingRequest || !approveNote.trim()) return;
    decide(approvingRequest.id, "approved", approveNote.trim(), undefined, (ok, error) => {
      if (!ok) {
        setApproveError(error ?? "Couldn't approve that request.");
        return;
      }
      setApprovingRequest(null);
      setApproveNote("");
      setApproveError(null);
    });
  }

  function cancelRequest(id: string) {
    setPendingId(id);
    startTransition(async () => {
      await fetch(`/api/leave/${id}`, { method: "DELETE" });
      setPendingId(null);
      router.refresh();
    });
  }

  // Team-Leader-only: delete any request regardless of status (e.g. an
  // approved leave entered in error) — separate from cancelRequest above,
  // which is the requester cancelling their own still-pending request.
  function confirmDelete() {
    if (!deletingRequest) return;
    const id = deletingRequest.id;
    setPendingId(id);
    startTransition(async () => {
      const res = await fetch(`/api/leave/${id}`, { method: "DELETE" });
      setPendingId(null);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Couldn't delete that request.");
        return;
      }
      setDeletingRequest(null);
      setDeleteError(null);
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return (
      <table className="w-full text-[13px] border-collapse">
        <tbody>
          <tr>
            <td className="py-4 text-[var(--muted)]">No leave requests yet.</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <>
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr>
          {canViewAll && <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>}
          <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
          <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
          <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Reason</th>
          <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
          <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Document</th>
          <th className="py-2.5 border-b border-[var(--line)]" />
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => {
          const typeConfig = leaveTypeConfigs.find((c) => c.key === r.leave_type);
          const isOwn = r.associate_id === viewerId;
          const isEditing = editingId === r.id;
          // Pre-approved types (Sick/Bereavement) can be filed before the
          // document is in hand, but can't actually be approved until it's
          // uploaded and the Team Leader has had a chance to check it.
          // Half-day requests of a document-requiring type are exempt — a few
          // hours off doesn't warrant a medical certificate, so they approve
          // straight through with no note prompt. Mirrored server-side in
          // /api/leave/[id].
          const needsDocument =
            typeConfig?.behavior === "auto_approve_document" && !r.document_path && !r.is_half_day;
          // If a pre-approved request got rejected for lack of a document
          // and the associate has since uploaded one, reopen it for
          // re-review instead of leaving it stuck rejected — the associate
          // can still upload after rejection (see DocumentUpload below),
          // so the Team Leader needs a way back to Approve/Reject once
          // that happens.
          // A final rejection ends that cycle for good -- it never reopens,
          // no matter what gets uploaded afterward.
          const isReopenedForReview =
            typeConfig?.behavior === "auto_approve_document" && r.status === "rejected" && Boolean(r.document_path) && !r.final_rejection;

          return (
            <Fragment key={r.id}>
              <tr>
                {canViewAll && (
                  <td className="py-2.5 border-b border-[var(--line)]">{formatFullName(r.profiles?.first_name, r.profiles?.last_name)}</td>
                )}
                <td className="py-2.5 border-b border-[var(--line)]">
                  <div className="flex items-center gap-1.5">
                    <span className="capitalize">{typeConfig?.label ?? r.leave_type}</span>
                    {r.is_half_day && <Pill>Half Day</Pill>}
                    {typeConfig?.behavior === "auto_approve_document" && <Pill tone="accent">Pre-approved</Pill>}
                    {typeConfig?.behavior === "auto_approve_document" && r.status === "approved" && !r.document_path && !r.is_half_day && (
                      <Pill tone="warn">Approved w/o document</Pill>
                    )}
                    {r.flagged_conflict && <Pill tone="warn">Possible conflict</Pill>}
                  </div>
                </td>
                <td className="py-2.5 border-b border-[var(--line)]">{formatLeaveRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges)}</td>
                <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.reason ?? "—"}</td>
                <td className="py-2.5 border-b border-[var(--line)]">
                  <Pill tone={STATUS_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                  {r.status === "rejected" && r.final_rejection && (
                    <div className="text-[10.5px] font-bold text-[var(--bad)] mt-1">Final — closed</div>
                  )}
                  {r.review_note && (r.status === "rejected" || (r.status === "approved" && !r.document_path)) && (
                    <div className="text-[10.5px] text-[var(--muted)] mt-1 max-w-[180px]">{r.review_note}</div>
                  )}
                </td>
                <td className="py-2.5 border-b border-[var(--line)]">
                  {typeConfig?.behavior === "auto_approve_document" ? (
                    isOwn ? (
                      <DocumentUpload
                        requestId={r.id}
                        hasDocument={Boolean(r.document_path)}
                        canDownload={canManage}
                        canReplace={r.status === "rejected" && !r.final_rejection}
                      />
                    ) : canManage && r.document_path ? (
                      <DocumentLinks requestId={r.id} canDownload={canManage} />
                    ) : canManage ? (
                      <span className="text-[var(--muted)]">{r.is_half_day ? "Not required" : "Not uploaded"}</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )
                  ) : (
                    <span className="text-[var(--muted)]">N/A</span>
                  )}
                </td>
                <td className="py-2.5 border-b border-[var(--line)]">
                  {isOwn && r.status === "pending" && !isEditing && (
                    <div className="flex gap-1.5">
                      <Button style={{ padding: "5px 10px" }} onClick={() => setEditingId(r.id)}>
                        Edit
                      </Button>
                      <Button style={{ padding: "5px 10px" }} disabled={pendingId === r.id} onClick={() => cancelRequest(r.id)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {canManage && (
                    <div className="flex flex-col gap-1 items-start">
                      {isReopenedForReview && (
                        <span className="text-[10.5px] font-bold text-[var(--accent-strong)]">Document uploaded — re-review</span>
                      )}
                      {/* Icon-only actions on one row — the labelled buttons
                          wrapped onto three stacked lines in this narrow
                          column. Each keeps its title/aria-label for clarity. */}
                      <div className="flex items-center gap-1">
                        {!isOwn && (r.status === "pending" || isReopenedForReview) && (
                          <>
                            <IconAction
                              tone="good"
                              label={needsDocument ? "Approve — no document attached yet, you'll be asked for a note" : "Approve"}
                              disabled={pendingId === r.id}
                              onClick={() => {
                                if (needsDocument) {
                                  setApprovingRequest(r);
                                  setApproveNote("");
                                  setApproveError(null);
                                  return;
                                }
                                decide(r.id, "approved");
                              }}
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </IconAction>
                            <IconAction
                              tone="bad"
                              label="Reject"
                              disabled={pendingId === r.id}
                              onClick={() => {
                                setRejectingRequest(r);
                                setRejectNote("");
                                setRejectError(null);
                              }}
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </IconAction>
                          </>
                        )}
                        <IconAction
                          tone="muted"
                          label="Delete"
                          disabled={pendingId === r.id}
                          onClick={() => {
                            setDeletingRequest(r);
                            setDeleteError(null);
                          }}
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </IconAction>
                      </div>
                      {!isOwn && needsDocument && (r.status === "pending" || isReopenedForReview) && (
                        <span className="text-[10.5px] text-[var(--muted)]">No document attached yet</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
              {isEditing && (
                <tr key={`${r.id}-edit`}>
                  <td colSpan={colCount} className="py-2.5 border-b border-[var(--line)]">
                    <EditLeaveRequestForm
                      requestId={r.id}
                      leaveTypeConfigs={leaveTypeConfigs}
                      requireReason={requireReason}
                      initialLeaveType={r.leave_type}
                      initialRanges={[{ start_date: r.start_date, end_date: r.end_date }, ...r.leave_request_ranges]}
                      initialReason={r.reason}
                      initialHalfDay={r.is_half_day}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>

    {rejectingRequest && (() => {
      const rejectingTypeConfig = leaveTypeConfigs.find((c) => c.key === rejectingRequest.leave_type);
      const isReopenableType = rejectingTypeConfig?.behavior === "auto_approve_document";
      const busy = pendingId === rejectingRequest.id;
      return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setRejectingRequest(null)}>
          <div
            className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-6 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">Reject this request?</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              Add a short note so the associate knows why — it&apos;s included in their notification.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="e.g. Overlaps another approved Vacation request"
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm resize-none"
              autoFocus
            />
            {isReopenableType && (
              <p className="text-[11.5px] text-[var(--muted)] m-0">
                <strong className="text-[var(--ink)]">Reject</strong> lets them re-upload and come back for another review.{" "}
                <strong className="text-[var(--ink)]">Reject — Final</strong> closes it for good, even if they upload again.
              </p>
            )}
            {rejectError && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{rejectError}</p>}
            <div className="flex justify-end gap-2 mt-1 flex-wrap">
              <Button style={{ padding: "7px 14px" }} disabled={busy} onClick={() => setRejectingRequest(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px", background: "var(--bad)", borderColor: "var(--bad)" }}
                disabled={busy || !rejectNote.trim()}
                onClick={() => submitReject(false)}
              >
                {busy ? "Rejecting…" : "Reject"}
              </Button>
              {isReopenableType && (
                <Button
                  variant="primary"
                  style={{ padding: "7px 14px", background: "var(--bad-strong)", borderColor: "var(--bad-strong)" }}
                  disabled={busy || !rejectNote.trim()}
                  onClick={() => submitReject(true)}
                >
                  {busy ? "Rejecting…" : "⛔ Reject — Final"}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    })()}

    {approvingRequest && (() => {
      const busy = pendingId === approvingRequest.id;
      const typeConfig = leaveTypeConfigs.find((c) => c.key === approvingRequest.leave_type);
      return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setApprovingRequest(null)}>
          <div
            className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-6 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">Approve without a document?</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              {typeConfig?.label ?? approvingRequest.leave_type} requests are normally held until a supporting
              document is uploaded. You can still approve this one on your own judgment — add a short note
              explaining why, so there&apos;s a record of it.
            </p>
            <textarea
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              rows={3}
              placeholder="e.g. Verbally confirmed, document to follow"
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm resize-none"
              autoFocus
            />
            {approveError && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{approveError}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <Button style={{ padding: "7px 14px" }} disabled={busy} onClick={() => setApprovingRequest(null)}>
                Cancel
              </Button>
              <Button variant="primary" style={{ padding: "7px 14px" }} disabled={busy || !approveNote.trim()} onClick={submitApproveWithoutDocument}>
                {busy ? "Approving…" : "Approve anyway"}
              </Button>
            </div>
          </div>
        </div>
      );
    })()}

    {deletingRequest && (() => {
      const busy = pendingId === deletingRequest.id;
      const typeConfig = leaveTypeConfigs.find((c) => c.key === deletingRequest.leave_type);
      return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setDeletingRequest(null)}>
          <div
            className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-6 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">Delete this leave request?</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              {formatFullName(deletingRequest.profiles?.first_name, deletingRequest.profiles?.last_name)}&apos;s{" "}
              {typeConfig?.label ?? deletingRequest.leave_type} request ({deletingRequest.status}) will be removed for
              good — this can&apos;t be undone.
            </p>
            {deleteError && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{deleteError}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <Button style={{ padding: "7px 14px" }} disabled={busy} onClick={() => setDeletingRequest(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px", background: "var(--bad)", borderColor: "var(--bad)" }}
                disabled={busy}
                onClick={confirmDelete}
              >
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
