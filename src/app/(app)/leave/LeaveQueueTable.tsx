"use client";

import { Fragment, useState, useTransition } from "react";
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
  leave_request_ranges: Range[];
  profiles: { first_name: string; last_name: string; avatar_url?: string | null } | null;
};

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

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
  const [, startTransition] = useTransition();
  const router = useRouter();

  const colCount = 4 + (canViewAll ? 1 : 0) + 2; // Type, Dates, Reason, Status + Associate? + Actions/Document

  function decide(id: string, status: "approved" | "rejected", note?: string, final?: boolean) {
    setPendingId(id);
    startTransition(async () => {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note, final }),
      });
      setPendingId(null);

      if (status === "rejected") {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setRejectError(body.error ?? "Couldn't reject that request.");
          return;
        }
        setRejectingRequest(null);
        setRejectNote("");
        setRejectError(null);
      }
      router.refresh();
    });
  }

  // Reopenable: can still flip back to Approve/Reject later if a new
  // document comes in. Final: ends the cycle for good, regardless of what
  // gets uploaded afterward -- see 0012_leave_final_rejection.sql.
  function submitReject(final: boolean) {
    if (!rejectingRequest || !rejectNote.trim()) return;
    decide(rejectingRequest.id, "rejected", rejectNote.trim(), final);
  }

  function cancelRequest(id: string) {
    setPendingId(id);
    startTransition(async () => {
      await fetch(`/api/leave/${id}`, { method: "DELETE" });
      setPendingId(null);
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
          const needsDocument = typeConfig?.behavior === "auto_approve_document" && !r.document_path;
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
                    {typeConfig?.behavior === "auto_approve_document" && <Pill tone="accent">Pre-approved</Pill>}
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
                  {r.status === "rejected" && r.review_note && (
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
                      <span className="text-[var(--muted)]">Not uploaded</span>
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
                  {!isOwn && canManage && (r.status === "pending" || isReopenedForReview) && (
                    <div className="flex flex-col gap-1 items-start">
                      {isReopenedForReview && (
                        <span className="text-[10.5px] font-bold text-[var(--accent-strong)]">Document uploaded — re-review</span>
                      )}
                      <div className="flex gap-1.5">
                        <Button
                          variant="primary"
                          style={{ padding: "5px 10px" }}
                          disabled={pendingId === r.id || needsDocument}
                          title={needsDocument ? "Waiting on a supporting document before this can be approved." : undefined}
                          onClick={() => decide(r.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          style={{ padding: "5px 10px" }}
                          disabled={pendingId === r.id}
                          onClick={() => {
                            setRejectingRequest(r);
                            setRejectNote("");
                            setRejectError(null);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                      {needsDocument && <span className="text-[10.5px] text-[var(--muted)]">Awaiting document</span>}
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
    </>
  );
}
