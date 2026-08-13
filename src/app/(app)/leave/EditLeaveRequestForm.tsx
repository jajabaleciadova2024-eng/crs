"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

type DateRange = { start_date: string; end_date: string };

export default function EditLeaveRequestForm({
  requestId,
  leaveTypeConfigs,
  requireReason,
  initialLeaveType,
  initialRanges,
  initialReason,
  onCancel,
}: {
  requestId: string;
  leaveTypeConfigs: LeaveTypeConfig[];
  requireReason: boolean;
  initialLeaveType: string;
  initialRanges: DateRange[];
  initialReason: string | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState(initialLeaveType);
  const [ranges, setRanges] = useState<DateRange[]>(initialRanges.length > 0 ? initialRanges : [{ start_date: "", end_date: "" }]);
  const [reason, setReason] = useState(initialReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedConfig = leaveTypeConfigs.find((c) => c.key === leaveType);

  const checkConflict = useCallback(async () => {
    const validRanges = ranges.filter((r) => r.start_date && r.end_date);
    if (selectedConfig?.behavior !== "vacation_conflict" || validRanges.length === 0) {
      setConflict(false);
      return;
    }
    const res = await fetch("/api/leave/check-conflict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_type: leaveType, ranges: validRanges, excludeRequestId: requestId }),
    });
    const body = await res.json().catch(() => ({}));
    setConflict(Boolean(body.conflict));
  }, [leaveType, ranges, selectedConfig, requestId]);

  useEffect(() => {
    // Live preview fetch in response to type/date changes — a legitimate
    // "synchronize with an external system" effect, not a state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkConflict();
  }, [checkConflict]);

  function updateRange(index: number, field: keyof DateRange, value: string) {
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRange() {
    setRanges((prev) => [...prev, { start_date: "", end_date: "" }]);
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setError(null);
    const validRanges = ranges.filter((r) => r.start_date && r.end_date);
    if (validRanges.length === 0) {
      setError("At least one start and end date are required.");
      return;
    }
    for (const r of validRanges) {
      if (r.end_date < r.start_date) {
        setError("A date range's end can't be before its start.");
        return;
      }
    }
    if (requireReason && !reason.trim()) {
      setError("A reason is required.");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/leave/${requestId}/edit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_type: leaveType, ranges: validRanges, reason: reason.trim() || null }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save changes.");
      return;
    }

    router.refresh();
    onCancel();
  }

  return (
    <div className="flex flex-col gap-2.5 bg-[var(--paper)] rounded-md p-3 border border-[var(--line)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">Leave type</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper-raised)] text-sm"
          >
            {leaveTypeConfigs.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Reason {requireReason ? "" : "(optional)"}
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper-raised)] text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="date"
              value={r.start_date}
              onChange={(e) => updateRange(i, "start_date", e.target.value)}
              className="px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper-raised)] text-sm"
            />
            <span className="text-[var(--muted)] text-xs">to</span>
            <input
              type="date"
              value={r.end_date}
              onChange={(e) => updateRange(i, "end_date", e.target.value)}
              className="px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper-raised)] text-sm"
            />
            {ranges.length > 1 && (
              <button type="button" onClick={() => removeRange(i)} aria-label="Remove date range" className="text-[var(--muted)] text-lg leading-none px-1">
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRange} className="text-xs font-bold text-[var(--accent-strong)] self-start">
          + Add another date range
        </button>
      </div>

      {selectedConfig?.behavior === "vacation_conflict" && conflict && (
        <p className="text-xs text-[var(--warn)] bg-[var(--warn-soft)] rounded px-2.5 py-1.5 m-0">
          One or more of these dates conflicts with another Vacation-type request.
        </p>
      )}

      {error && <p className="text-xs text-[var(--bad)] bg-[var(--bad-soft)] rounded px-2.5 py-1.5 m-0">{error}</p>}

      <div className="flex justify-end gap-1.5">
        <Button variant="primary" style={{ padding: "5px 10px" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button style={{ padding: "5px 10px" }} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
