"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/database.types";

const OPTIONS: { role: AppRole; label: string; description: string; icon: string }[] = [
  { role: "team_leader", label: "Team Leader", description: "Full access — your real role", icon: "👑" },
  { role: "oic", label: "OIC", description: "View-all but no write access", icon: "🎖️" },
  { role: "associate", label: "Associate", description: "Own data only", icon: "👤" },
];

export default function PreviewRoleSwitcher({ currentRole }: { currentRole: AppRole }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function setPreview(role: AppRole) {
    if (role === currentRole || pending) return;
    setOpen(false);
    startTransition(async () => {
      await fetch("/api/preview-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      router.refresh();
    });
  }

  const current = OPTIONS.find((o) => o.role === currentRole) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative md:group-data-[collapsed=true]/sidebar:hidden">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-raised)] hover:border-[var(--accent)] transition-all disabled:opacity-60"
      >
        <div className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-sm shrink-0">
          {current.icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] leading-none mb-0.5">
            Viewing as
          </div>
          <div className="text-[12px] font-semibold text-[var(--ink)] truncate leading-tight">
            {pending ? "Switching…" : current.label}
          </div>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1.5 bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {OPTIONS.map((opt) => {
            const active = opt.role === currentRole;
            return (
              <button
                key={opt.role}
                type="button"
                onClick={() => setPreview(opt.role)}
                disabled={pending}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left disabled:opacity-50 ${
                  active
                    ? "bg-[var(--accent-soft)]/40"
                    : "hover:bg-[var(--accent-soft)]/20"
                }`}
              >
                <span className="text-sm w-5 text-center shrink-0">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--ink)] leading-tight">{opt.label}</div>
                  <div className="text-[10px] text-[var(--muted)] leading-tight mt-0.5">{opt.description}</div>
                </div>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
