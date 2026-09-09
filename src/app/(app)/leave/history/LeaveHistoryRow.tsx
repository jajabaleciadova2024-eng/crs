"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";
import { formatLeaveRanges } from "@/lib/leaveFormat";
import { formatFullName } from "@/lib/format";
import { DocumentLinks } from "../DocumentUpload";
import DeleteLeaveButton from "./DeleteLeaveButton";
import type { LeaveStatus } from "@/lib/database.types";

const STATUS_TONE: Record<LeaveStatus, "warn" | "good" | "bad"> = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
};

export type HistoryRow = {
  id: string;
  associate_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  document_path: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  final_rejection: boolean;
  is_half_day: boolean;
  profiles: { first_name: string; last_name: string; avatar_url: string | null } | null;
  leave_request_ranges: { start_date: string; end_date: string }[] | null;
};

export type LeaveTypeConfig = {
  key: string;
  label: string;
  behavior?: string;
};

export default function LeaveHistoryRow({
  r,
  canViewAll,
  canDownload,
  isTL,
  typeConfig,
}: {
  r: HistoryRow;
  canViewAll: boolean;
  canDownload: boolean;
  isTL: boolean;
  typeConfig: LeaveTypeConfig | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (r as any).profiles;
  const memberName = formatFullName(p?.first_name, p?.last_name);

  const hasDetails =
    r.reason ||
    (r.review_note && (r.status === "rejected" || (r.status === "approved" && !r.document_path)));

  return (
    <>
      <tr
        className="hover:bg-[var(--paper-raised)] transition-colors cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {/* Chevron */}
        <td className="pl-2 sm:pl-3 pr-0 py-2.5 border-b border-[var(--line)] w-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`text-[var(--muted)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </td>
        {canViewAll && (
          <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">{memberName}</td>
        )}
        <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap capitalize">
          <div className="flex items-center gap-1.5">
            <span>{typeConfig?.label ?? r.leave_type}</span>
            {r.is_half_day && <Pill>½</Pill>}
          </div>
        </td>
        <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap text-[var(--muted)]">
          {formatLeaveRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges ?? [])}
        </td>
        <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
          <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
        </td>
        <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap text-[var(--muted)]">
          {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"}
        </td>
        {isTL && (
          <td className="px-1.5 py-2.5 border-b border-[var(--line)]" onClick={(e) => e.stopPropagation()}>
            <DeleteLeaveButton id={r.id} label={memberName} />
          </td>
        )}
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td
            colSpan={99}
            className="px-4 sm:px-6 py-3 border-b border-[var(--line)] bg-[var(--paper-raised)]"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[12.5px]">
              {/* Reason */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block mb-0.5">Reason</span>
                <span className="text-[var(--ink)] whitespace-pre-wrap break-words">{r.reason || "—"}</span>
              </div>

              {/* Document */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block mb-0.5">Document</span>
                {typeConfig?.behavior === "auto_approve_document" ? (
                  r.document_path ? (
                    <DocumentLinks
                      requestId={r.id}
                      canDownload={canDownload}
                      memberName={memberName}
                    />
                  ) : (
                    <span className="text-[var(--muted)]">Not uploaded</span>
                  )
                ) : (
                  <span className="text-[var(--muted)]">N/A</span>
                )}
              </div>

              {/* Review note */}
              {r.review_note && (r.status === "rejected" || (r.status === "approved" && !r.document_path)) && (
                <div className="sm:col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold block mb-0.5">Review Note</span>
                  <span className="text-[var(--ink)] whitespace-pre-wrap break-words">{r.review_note}</span>
                </div>
              )}

              {/* Final rejection */}
              {r.status === "rejected" && r.final_rejection && (
                <div className="sm:col-span-2">
                  <Pill tone="bad">Final — closed</Pill>
                </div>
              )}

              {/* Approved without doc */}
              {typeConfig?.behavior === "auto_approve_document" && r.status === "approved" && !r.document_path && !r.is_half_day && (
                <div className="sm:col-span-2">
                  <Pill tone="warn">Approved without document</Pill>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
