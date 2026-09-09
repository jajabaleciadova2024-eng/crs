"use client";

import { useEffect, useState } from "react";

// Three-way appearance control: follow the device, or force light/dark.
//
// Why this exists: the palette in globals.css has always had both light and
// dark values, but nothing ever set `data-theme`, so every person's colours
// silently followed their own device's dark/light setting. Two people on the
// same page saw different apps and assumed it was role-based. This makes
// the choice explicit and per-device (localStorage), and ThemeScript in the
// root layout applies it before first paint so there is no flash.

export const THEME_KEY = "crs_theme";
export type ThemePref = "system" | "light" | "dark";

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  // Keep the mobile browser chrome (address bar) in step with the page.
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#12201b" : "#e6f2dd";
}

function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    label: "System",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
];

export default function ThemeToggle({
  showLabels = false,
  className = "",
}: {
  /** Full-width segmented control with text labels (Settings) vs. compact icon row (sidebar). */
  showLabels?: boolean;
  className?: string;
}) {
  const [pref, setPref] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(readPref());
    setMounted(true);
  }, []);

  // Re-apply on OS changes while "system" is selected so the theme-color
  // meta follows along (the CSS media query handles the palette itself).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(readPref());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] ${
        showLabels ? "w-full" : ""
      } ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = mounted && pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => choose(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
              showLabels ? "flex-1 px-3 py-2" : "w-8 h-7"
            } ${
              active
                ? "bg-[var(--paper-raised)] text-[var(--accent-strong)] shadow-[var(--shadow-xs)]"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)]/40"
            }`}
          >
            {o.icon}
            {showLabels && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
