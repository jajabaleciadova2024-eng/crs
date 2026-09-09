"use client";

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
