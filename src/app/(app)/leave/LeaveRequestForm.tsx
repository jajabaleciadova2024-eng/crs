"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { LeaveType } from "@/lib/database.types";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "sick", label: "Sick" },
  { value: "vacation", label: "Vacation" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

export default function LeaveRequestForm({ requireReason }: { requireReason: boolean }) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState<LeaveType>("sick");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    if (requireReason && !reason.trim()) {
      setError("A reason is required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || null,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't submit your request. Please try again.");
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    setLeaveType("sick");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Leave type</label>
        <select
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value as LeaveType)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
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
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">End date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>

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
