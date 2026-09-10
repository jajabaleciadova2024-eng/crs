"use client";

import { Button, Modal } from "@/components/ui";
import { useEffect, useState } from "react";

type Reminder = { period: string; coverageLabel: string };

export default function LeaveFilingReminderModal() {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [showing, setShowing] = useState<{ n: number; total: number } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/leave/reminder", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.reminder && !cancelled) {
          setReminder(data.reminder);
          setShowing({ n: data.showing, total: data.totalShowings });
          setShow(true);
          fetch("/api/leave/reminder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period: data.reminder.period }),
          }).catch(() => {});
        }
      } catch {
        // Not critical
      }
    }
    const timer = setTimeout(check, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (!show || !reminder) return null;

  return (
    <Modal size="sm" zIndex={60} onClose={() => setShow(false)} className="p-0! sm:p-0! gap-0 overflow-hidden">
      <div className="bg-[var(--warn)] px-6 py-4 text-[var(--on-accent)] rounded-t-2xl sm:rounded-t-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[20px]">📋</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Leave Filing Reminder</span>
        </div>
        <h2 className="text-[18px] font-serif font-bold m-0 leading-tight">Coverage: {reminder.coverageLabel}</h2>
      </div>

      <div className="px-6 py-5">
        <p className="text-[14px] text-[var(--ink)] leading-relaxed m-0">
          Please file your leave for the coverage period <strong>{reminder.coverageLabel}</strong>.
          If you don&apos;t have any leave to file, just ignore this reminder.
        </p>
        <p className="text-[13px] text-[var(--bad)] font-semibold mt-3 m-0">
          Failure to file will result in LWOP (Leave Without Pay).
        </p>
      </div>

      <div className="px-6 py-4 border-t border-[var(--line)] flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-[var(--muted)]">
          {showing && showing.n >= showing.total
            ? "Last reminder"
            : showing
              ? `Reminder ${showing.n} of ${showing.total}`
              : ""}
        </span>
        <Button variant="primary" size="lg" onClick={() => setShow(false)}>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
