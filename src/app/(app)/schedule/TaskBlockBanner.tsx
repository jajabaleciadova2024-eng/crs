"use client";

import Link from "next/link";

export default function TaskBlockBanner({
  taskCount,
}: {
  taskCount: number;
}) {
  return (
    <div className="bg-[var(--warn-soft)] border border-[var(--warn)]/30 rounded-xl p-5 text-center animate-fade-in-up">
      <div className="flex justify-center mb-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>
      <h3 className="text-[15px] font-bold text-[var(--warn)] mb-1">Schedule Locked</h3>
      <p className="text-[13px] text-[var(--ink)] mb-3">
        You have {taskCount} pending task{taskCount !== 1 ? "s" : ""} that must be completed before you can view upcoming schedules.
      </p>
      <Link
        href="/tasks"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[12.5px] font-bold bg-[var(--warn)] text-white hover:opacity-90 transition-opacity"
      >
        Go to Tasks →
      </Link>
    </div>
  );
}
