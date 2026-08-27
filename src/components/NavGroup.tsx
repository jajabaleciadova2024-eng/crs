"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Collapsible sidebar group — starts expanded if any child route is active.
export default function NavGroup({
  label,
  icon,
  children,
  childHrefs,
  badgeCount = 0,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  // Used to auto-expand when a child page is active
  childHrefs: string[];
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const hasActiveChild = childHrefs.some(
    (href) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  );
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 cursor-pointer md:group-data-[collapsed=true]/sidebar:justify-center md:group-data-[collapsed=true]/sidebar:px-0 ${
          hasActiveChild
            ? "text-[var(--accent-strong)]"
            : "text-[var(--muted)] hover:bg-[var(--accent-soft)]/60 hover:text-[var(--ink)]"
        }`}
      >
        <span className={`transition-colors ${hasActiveChild ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}>
          {icon}
        </span>
        <span className="flex-1 truncate text-left md:group-data-[collapsed=true]/sidebar:hidden">{label}</span>
        {badgeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[19px] h-[19px] px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold tabular-nums md:group-data-[collapsed=true]/sidebar:absolute md:group-data-[collapsed=true]/sidebar:-top-1 md:group-data-[collapsed=true]/sidebar:-right-1"
            style={{ boxShadow: "var(--shadow-xs)" }}
          >
            {badgeCount}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-150 md:group-data-[collapsed=true]/sidebar:hidden ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pl-3 mt-0.5 md:group-data-[collapsed=true]/sidebar:pl-0">
          {children}
        </div>
      )}
    </div>
  );
}
