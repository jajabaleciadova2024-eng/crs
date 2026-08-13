"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill, Avatar, Button } from "@/components/ui";
import EditLeaveRequestForm from "./EditLeaveRequestForm";
import DocumentUpload, { DocumentLinks } from "./DocumentUpload";
import type { LeaveStatus } from "@/lib/database.types";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

type Range = { start_date: string; end_date: string };

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
  leave_request_ranges: Range[];
  profiles: { first_name: string; last_name: string } | null;
};

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

function formatRanges(primary: Range, extra: Range[]) {
  const all = [primary, ...extra];
  const label = (r: Range) => (r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`);
  if (all.length === 1) return label(all[0]);
  return `${label(all[0])} +${all.length - 1} more`;
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
  const [, startTransition] = useTransition();
  const router = useRouter();

  const colCount = 4 + (canViewAll ? 1 : 0) + 2; // Type, Dates, Reason, Status + Associate? + Actions/Document

  function decide(id: string, status: "approved" | "rejected") {
    setPendingId(id);
    startTransition(async () => {
      await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setPendingId(null);
      router.refresh();
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
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr>
          {canViewAll && <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Associate</th>}
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Type</th>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Dates</th>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Reason</th>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Status</th>
          <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Document</th>
          <th className="py-2.5 border-b border-[var(--line)]" />
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => {
          const typeConfig = leaveTypeConfigs.find((c) => c.key === r.leave_type);
          const isOwn = r.associate_id === viewerId;
          const isEditing = editingId === r.id;

          return (
            <Fragment key={r.id}>
              <tr>
                {canViewAll && (
                  <td className="py-2.5 border-b border-[var(--line)]">
                    <span className="flex items-center">
                      <Avatar firstName={r.profiles?.first_name ?? ""} lastName={r.profiles?.last_name ?? ""} />
                      {r.profiles?.first_name} {r.profiles?.last_name}
                    </span>
                  </td>
                )}
                <td className="py-2.5 border-b border-[var(--line)]">
                  <div className="flex items-center gap-1.5">
                    <span className="capitalize">{typeConfig?.label ?? r.leave_type}</span>
                    {typeConfig?.behavior === "auto_approve_document" && <Pill tone="accent">Auto-approved type</Pill>}
                    {r.flagged_conflict && <Pill tone="warn">Possible conflict</Pill>}
                  </div>
                </td>
                <td className="py-2.5 border-b border-[var(--line)]">{formatRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges)}</td>
                <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{r.reason ?? "—"}</td>
                <td className="py-2.5 border-b border-[var(--line)]">
                  <Pill tone={STATUS_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                </td>
                <td className="py-2.5 border-b border-[var(--line)]">
                  {typeConfig?.behavior === "auto_approve_document" ? (
                    isOwn ? (
                      <DocumentUpload requestId={r.id} hasDocument={Boolean(r.document_path)} />
                    ) : canManage && r.document_path ? (
                      <DocumentLinks requestId={r.id} />
                    ) : canManage ? (
                      <span className="text-[var(--muted)]">Not uploaded</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
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
                  {!isOwn && canManage && r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pendingId === r.id} onClick={() => decide(r.id, "approved")}>
                        Approve
                      </Button>
                      <Button style={{ padding: "5px 10px" }} disabled={pendingId === r.id} onClick={() => decide(r.id, "rejected")}>
                        Reject
                      </Button>
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
  );
}
