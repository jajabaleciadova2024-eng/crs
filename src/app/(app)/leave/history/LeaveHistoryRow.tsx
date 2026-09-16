"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";
import { formatLeaveRanges } from "@/lib/leaveFormat";
import { formatFullName } from "@/lib/format";
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

function ReasonCell({ reason }: { reason: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!reason) {
    return (
      <td className="px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">—</td>
    );
  }

  const isLong = reason.length > 40;

  function copy() {
    navigator.clipboard.writeText(reason!).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <td className="px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)]">
      <div className="flex items-start gap-1 group">
        <span
          className={expanded ? "break-words whitespace-pre-wrap" : "block truncate cursor-pointer"}
          onClick={isLong && !expanded ? () => setExpanded(true) : undefined}
          title={isLong && !expanded ? "Click to expand" : undefined}
        >
          {reason}
        </span>
        <button
          type="button"
          onClick={copy}
          title={copied ? "Copied!" : "Copy reason"}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--accent-strong)] cursor-pointer"
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      {isLong && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] font-semibold text-[var(--accent-strong)] hover:underline cursor-pointer mt-0.5"
        >
          Collapse
        </button>
      )}
    </td>
  );
}

export default function LeaveHistoryRow({
  r,
  canViewAll,
  isTL,
  typeConfig,
}: {
  r: HistoryRow;
  canViewAll: boolean;
  isTL: boolean;
  typeConfig: LeaveTypeConfig | undefined;
}) {
  const p = r.profiles;
  const memberName = formatFullName(p?.first_name, p?.last_name);

  return (
    <tr className="hover:bg-[var(--paper-raised)]/60 transition-colors">
      {canViewAll && (
        <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap font-medium truncate">
          {memberName}
        </td>
      )}

      <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap capitalize">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{typeConfig?.label ?? r.leave_type}</span>
          {r.is_half_day && <Pill>½ day</Pill>}
        </div>
      </td>

      <td className="px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap truncate">
        {formatLeaveRanges({ start_date: r.start_date, end_date: r.end_date }, r.leave_request_ranges ?? [])}
      </td>

      <ReasonCell reason={r.reason} />

      <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <Pill tone={STATUS_TONE[r.status as LeaveStatus]}>
            {r.status[0].toUpperCase() + r.status.slice(1)}
          </Pill>
          {r.status === "rejected" && r.final_rejection && (
            <span className="text-[10px] font-bold text-[var(--bad)]">Final</span>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap text-[var(--muted)]">
        {r.reviewed_at
          ? new Date(r.reviewed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
          : "—"}
      </td>

      {isTL && (
        <td className="px-2 py-2.5 border-b border-[var(--line)] text-center">
          <DeleteLeaveButton id={r.id} label={memberName} />
        </td>
      )}
    </tr>
  );
}
