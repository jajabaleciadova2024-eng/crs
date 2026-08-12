"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

type DateRange = { start_date: string; end_date: string };

const BLANK_RANGE: DateRange = { start_date: "", end_date: "" };

export default function LeaveRequestForm({
  leaveTypeConfigs,
  requireReason,
}: {
  leaveTypeConfigs: LeaveTypeConfig[];
  requireReason: boolean;
}) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState(leaveTypeConfigs[0]?.key ?? "");
  const [ranges, setRanges] = useState<DateRange[]>([{ ...BLANK_RANGE }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      body: JSON.stringify({ leave_type: leaveType, ranges: validRanges }),
    });
    const body = await res.json().catch(() => ({}));
    setConflict(Boolean(body.conflict));
  }, [leaveType, ranges, selectedConfig]);

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
    setRanges((prev) => [...prev, { ...BLANK_RANGE }]);
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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

    setSubmitting(true);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_type: leaveType, ranges: validRanges, reason: reason.trim() || null }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't submit your request. Please try again.");
      return;
    }

    setRanges([{ ...BLANK_RANGE }]);
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Leave type</label>
        <select
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        >
          {leaveTypeConfigs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">
          Reason {requireReason ? "" : "(optional)"}
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Brief note"
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>

      <div className="col-span-2 flex flex-col gap-2">
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
          Date(s) — add more if they&apos;re not consecutive
        </label>
        {ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="date"
              value={r.start_date}
              onChange={(e) => updateRange(i, "start_date", e.target.value)}
              className="flex-1 px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
            />
            <span className="text-[var(--muted)] text-xs">to</span>
            <input
              type="date"
              value={r.end_date}
              onChange={(e) => updateRange(i, "end_date", e.target.value)}
              className="flex-1 px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
            />
            {ranges.length > 1 && (
              <button
                type="button"
                onClick={() => removeRange(i)}
                aria-label="Remove date range"
                className="text-[var(--muted)] text-lg leading-none px-1"
              >
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
        <p className="col-span-2 text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
          One or more of these dates already has another Vacation-type leave request on record. You can still submit
          — it&apos;ll be flagged for review — but it&apos;s more likely to be rejected.
        </p>
      )}

      {selectedConfig?.behavior === "auto_approve_document" && (
        <p className="col-span-2 text-sm text-[var(--muted)] bg-[var(--accent-soft)] rounded px-3 py-2 m-0">
          {selectedConfig.label} requests typically don&apos;t need review. Once it&apos;s filed, upload your supporting
          document (e.g. medical certificate) from the queue below — you can do that now or once you&apos;re back.
        </p>
      )}

      {error && (
        <p role="alert" className="col-span-2 text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="col-span-2 flex justify-end gap-2 mt-1">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
