"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/database.types";

const OPTIONS: { role: AppRole; short: string; full: string }[] = [
  { role: "team_leader", short: "TL", full: "Team Leader (you)" },
  { role: "oic", short: "OIC", full: "OIC" },
  { role: "associate", short: "Assoc", full: "Associate" },
];

// Team-Leader-only "view app as" switcher. See requireProfileWithPreview in
// src/lib/auth.ts — setting this makes the entire app (nav, page guards,
// buttons, User Guide) behave exactly as the selected role would see it.
// A segmented control instead of a plain <select> — the current role is
// always visible at a glance instead of hidden behind a closed dropdown,
// and switching is a single click.
export default function PreviewRoleSwitcher({ currentRole }: { currentRole: AppRole }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setPreview(role: AppRole) {
    if (role === currentRole || pending) return;
    startTransition(async () => {
      await fetch("/api/preview-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper-raised)] p-2.5">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] shrink-0">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">View as</span>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-[var(--paper)] p-1 border border-[var(--line)]">
        {OPTIONS.map((opt) => {
          const active = opt.role === currentRole;
          return (
            <button
              key={opt.role}
              type="button"
              disabled={pending}
              title={opt.full}
              onClick={() => setPreview(opt.role)}
              className={`px-1.5 py-1.5 rounded text-[10.5px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]"
              }`}
              style={active ? { boxShadow: "var(--shadow-xs)" } : undefined}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
      {pending && <div className="text-[10px] text-[var(--muted)] mt-1.5 text-center animate-pulse">Switching…</div>}
    </div>
  );
}
