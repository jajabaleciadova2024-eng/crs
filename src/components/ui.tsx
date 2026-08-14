"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

// Title bar pinned to the top of every page inside the app shell — stays
// in view while the page's content scrolls under it, same as the sidebar.
// Deliberately `position: fixed`, not `sticky`: same reasoning as the
// sidebar (see SidebarShell's top comment) — `sticky` was empirically
// unreliable in this app's layout, while `fixed` has no containing-block
// ambiguity to get wrong. `left`/`width` track the sidebar's own
// `--sidebar-width` custom property so the header's horizontal bounds
// always match <main>'s, and an invisible clone directly below reserves
// the header's real (possibly-wrapping) height in the normal document
// flow, since the visible fixed copy is removed from it. `top` accounts
// for the mobile hamburger bar (itself sticky at the very top on small
// screens, see SidebarShell) so the two don't overlap; desktop has no
// such bar, so it sticks flush at 0. Pass `children` instead of
// title/subtitle/action for a fully custom header layout (e.g. the
// dashboard's profile-photo header) while still getting the same chrome.
export function PageHeader({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const content = children ?? (
    <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="font-serif text-[22px] sm:text-2xl md:text-[26px] m-0 mb-1 leading-tight tracking-tight">
            {title}
          </h1>
        )}
        {subtitle && <p className="text-[13px] sm:text-sm text-[var(--muted)] m-0 leading-snug">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 sm:gap-3 shrink-0">{action}</div>}
    </div>
  );

  const headerRef = useRef<HTMLElement>(null);

  // Publish the header's actual rendered bottom edge as a CSS var so
  // anything that wants to stick directly beneath it (e.g. the Team
  // Feed composer) can position off a real measurement instead of a
  // guessed pixel value — title/subtitle length and breakpoint both
  // change this header's height, so a hardcoded offset drifts.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty("--header-bottom", `${el.getBoundingClientRect().bottom}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  });

  return (
    <>
      {/* Space-reserving clone — invisible but still laid out, so the
          fixed header (removed from flow) doesn't cause content below it
          to jump up underneath it. Same content/width as the visible
          copy so its height always matches, however long a given page's
          title/subtitle/action ends up being. */}
      <div aria-hidden="true" className="invisible px-3 sm:px-4 md:px-10 py-3.5 md:py-5 mb-4 md:mb-6 border-b border-transparent">
        {content}
      </div>
      <header
        ref={headerRef}
        className="fixed z-20 top-[calc(56px+var(--preview-offset,0px))] md:top-[var(--preview-offset,0px)] left-0 md:left-[var(--sidebar-width,220px)] w-full md:w-[calc(100%-var(--sidebar-width,220px))] max-w-[1000px] px-3 sm:px-4 md:px-10 py-3.5 md:py-5 bg-[var(--paper)]/85 backdrop-blur-md border-b border-[var(--line)] transition-[left,width,top] duration-200 ease-out"
      >
        {content}
      </header>
    </>
  );
}

export function Panel({
  title,
  hint,
  action,
  children,
  footnote,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <div
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl mb-4 overflow-hidden animate-fade-in-up"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-[var(--line)]">
        <h2 className="text-[13px] sm:text-sm font-bold m-0 tracking-tight truncate">{title}</h2>
        {action ?? (hint && <span className="text-[11px] sm:text-xs text-[var(--muted)] font-medium shrink-0">{hint}</span>)}
      </div>
      <div className="px-4 sm:px-5 pb-4 pt-2">{children}</div>
      {footnote && (
        <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 text-[11.5px] sm:text-xs text-[var(--muted)] bg-[var(--paper)]/60 border-t border-dashed border-[var(--line)] leading-relaxed">
          {footnote}
        </div>
      )}
    </div>
  );
}

const PILL_STYLES: Record<string, string> = {
  good: "bg-[var(--good-soft)] text-[var(--good)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
  bad: "bg-[var(--bad-soft)] text-[var(--bad)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  muted: "bg-[var(--paper)] text-[var(--muted)]",
};

export function Pill({ tone = "muted", children }: { tone?: keyof typeof PILL_STYLES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide leading-relaxed whitespace-nowrap ${PILL_STYLES[tone]}`}
    >
      <span className="w-[5px] h-[5px] rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

export function Card({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
  // When set, the whole card becomes a link (e.g. "Next Week's Station"
  // pointing at Weekly Schedule) instead of a plain stat display.
  href?: string;
}) {
  const className =
    "group block bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl px-4 py-4 hover:border-[var(--accent)] hover:-translate-y-[1px] transition-all duration-200";
  const content = (
    <>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5 group-hover:text-[var(--accent-strong)] transition-colors">
        {label}
      </div>
      <div
        className="font-serif text-[26px] sm:text-[28px] tabular-nums leading-none"
        style={tone === "warn" ? { color: "var(--warn)" } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-[var(--muted)] mt-1.5 leading-snug">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={{ boxShadow: "var(--shadow-xs)" }}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={{ boxShadow: "var(--shadow-xs)" }}>
      {content}
    </div>
  );
}

export function Avatar({
  firstName,
  lastName,
  avatarUrl,
  size = "sm",
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const sizes = {
    sm: { outer: "w-[28px] h-[28px]", text: "text-[10px]", ring: "ring-1", mr: "mr-2" },
    md: { outer: "w-[36px] h-[36px]", text: "text-[12px]", ring: "ring-2", mr: "mr-2.5" },
    lg: { outer: "w-[72px] h-[72px]", text: "text-[22px]", ring: "ring-2", mr: "" },
  };
  const s = sizes[size];

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className={`${s.outer} rounded-full object-cover ${s.ring} ring-[var(--accent-soft)] ${s.mr} shrink-0`}
      />
    );
  }

  return (
    <span
      className={`inline-flex ${s.outer} rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] items-center justify-center ${s.text} font-bold ${s.mr} shrink-0 ${s.ring} ring-[var(--accent-soft)]`}
    >
      {initials}
    </span>
  );
}

export function Button({
  children,
  variant = "ghost",
  href,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  // When set, renders as a nav Link styled identically to the button
  // (e.g. "View calendar" / "View history") instead of an actual <button>.
  href?: string;
}) {
  // min-h-[36px] keeps the primary hit-target comfortable on both mobile
  // (touch spec's ~44px minimum is close after the caller's own padding)
  // and desktop, without being visually clunky. inline-flex with center
  // alignment stops icon+text buttons from wobbling in height.
  const base = "inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3.5 py-1.5 rounded-md text-[12.5px] font-bold border cursor-pointer whitespace-nowrap select-none";
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)] hover:-translate-y-[0.5px] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]"
      : "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 hover:shadow-[var(--shadow-xs)] disabled:opacity-50 disabled:cursor-not-allowed";

  if (href) {
    return (
      <Link href={href} className={`${base} ${styles}`}>
        {children}
      </Link>
    );
  }

  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}
