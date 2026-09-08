"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
          title/subtitle/action ends up being — which is why the md:pr-[84px]
          below has to appear on BOTH copies, not just the real header.

          That padding is the notification bell's footprint. The bell is
          fixed at right-6 on desktop and floats ABOVE this header (z-40 vs
          z-20), so without reserved space a page's action buttons run
          straight underneath it. On mobile the bell sits in the hamburger
          bar instead, clear of the header, so the reservation is md-only. */}
      <div aria-hidden="true" className="invisible px-3 sm:px-4 md:px-10 md:pr-[84px] py-3.5 md:py-5 mb-3 md:mb-4 border-b border-transparent">
        {content}
      </div>
      <header
        ref={headerRef}
        className="fixed z-20 top-[calc(56px+var(--safe-top)+var(--preview-offset,0px))] md:top-[var(--preview-offset,0px)] left-0 md:left-[var(--sidebar-width,220px)] w-full md:w-[calc(100%-var(--sidebar-width,220px))] px-3 sm:px-4 md:px-10 md:pr-[84px] py-3.5 md:py-5 glass border-b border-[var(--line)] transition-[left,width,top] duration-200 ease-out"
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
  fill = false,
  collapsed,
  onToggle,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  footnote?: string;
  /** Opt-in collapsing. Omit both and the panel behaves exactly as before —
      always open, header not interactive. */
  collapsed?: boolean;
  onToggle?: () => void;
  // Stretch to the height of its grid row and let the body grow, so panels
  // sitting side by side line their inner sections up instead of each ending
  // wherever its own content happens to stop.
  fill?: boolean;
}) {
  return (
    <div
      className={`bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-fade-in-up ${
        fill ? "h-full flex flex-col mb-0" : "mb-4"
      }`}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div
        // flex-wrap: on a narrow screen a long title and a busy action row
        // cannot share a line, and without it the title — which is flex-1 —
        // was the one that gave, squeezed to zero width at 320px.
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 sm:px-5 py-3 sm:py-3.5 ${
          collapsed ? "" : "border-b border-[var(--line)]"
        }`}
      >
        {onToggle ? (
          // The title is the toggle, not just the chevron — a 13px arrow is
          // a poor target on a phone.
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`shrink-0 text-[var(--muted)] transition-transform duration-150 ${
                collapsed ? "" : "rotate-90"
              }`}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <h2 className="text-[13px] sm:text-sm font-bold m-0 tracking-tight truncate">{title}</h2>
          </button>
        ) : (
          <h2 className="text-[13px] sm:text-sm font-bold m-0 tracking-tight truncate">{title}</h2>
        )}
        {action ?? (hint && <span className="text-[11px] sm:text-xs text-[var(--muted)] font-medium shrink-0">{hint}</span>)}
      </div>
      {!collapsed && (
        <div className={`px-4 sm:px-5 pb-4 pt-2 ${fill ? "flex-1 flex flex-col" : ""}`}>{children}</div>
      )}
      {footnote && !collapsed && (
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

export function Pill({
  tone = "muted",
  size = "md",
  dot = true,
  children,
}: {
  tone?: keyof typeof PILL_STYLES;
  /** xs = compact role badge next to a name; md = status pill in a table. */
  size?: "xs" | "md";
  /** Leading status dot — off for identity badges (TL / OIC) that aren't a state. */
  dot?: boolean;
  children: ReactNode;
}) {
  const dims = size === "xs" ? "px-1.5 py-px text-[9.5px] gap-1 uppercase" : "px-2.5 py-0.5 text-[11px] gap-1.5";
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold tracking-wide leading-relaxed whitespace-nowrap ${dims} ${PILL_STYLES[tone]}`}
    >
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current opacity-80" />}
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
  extraClass,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
  // When set, the whole card becomes a link (e.g. "Next Week's Station"
  // pointing at Weekly Schedule) instead of a plain stat display.
  href?: string;
  /** Extra layout classes from the caller — e.g. flex sizing in a stat row. */
  extraClass?: string;
}) {
  const className =
    "group block bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl px-4 py-4" +
    (href ? " lift hover:border-[var(--accent)] cursor-pointer" : "") +
    (extraClass ? ` ${extraClass}` : "");
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

const BUTTON_VARIANTS = {
  primary:
    "bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)] hover:-translate-y-[0.5px] active:translate-y-0 disabled:hover:transform-none shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]",
  ghost:
    "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]/30 hover:shadow-[var(--shadow-xs)]",
  danger:
    "bg-[var(--bad)] border-[var(--bad)] text-[var(--on-accent)] hover:bg-[var(--bad-strong)] hover:border-[var(--bad-strong)] hover:-translate-y-[0.5px] active:translate-y-0 disabled:hover:transform-none shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]",
  "danger-ghost":
    "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--bad)] hover:border-[var(--bad)] hover:bg-[var(--bad-soft)]/60 hover:shadow-[var(--shadow-xs)]",
} as const;

const BUTTON_SIZES = {
  sm: "min-h-[30px] px-2.5 py-1 text-[11.5px] rounded-md",
  md: "min-h-[34px] px-3.5 py-1.5 text-[12.5px] rounded-md",
  lg: "min-h-[42px] px-5 py-2.5 text-[13.5px] rounded-lg",
} as const;

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

export function Button({
  children,
  variant = "ghost",
  size = "md",
  loading = false,
  block = false,
  href,
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  /** Shows a spinner and disables the button; children stay as the label. */
  loading?: boolean;
  /** Full width — the usual choice for the primary action on a phone. */
  block?: boolean;
  // When set, renders as a nav Link styled identically to the button
  // (e.g. "View calendar" / "View history") instead of an actual <button>.
  href?: string;
}) {
  // min-h keeps the hit-target comfortable on both mobile (touch spec's
  // ~44px minimum is close after the caller's own padding) and desktop,
  // without being visually clunky. inline-flex with center alignment stops
  // icon+text buttons from wobbling in height.
  const base =
    "inline-flex items-center justify-center gap-1.5 font-bold border cursor-pointer whitespace-nowrap select-none disabled:opacity-50 disabled:cursor-not-allowed";
  const cls = `${base} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Square icon-only button — consistent 32px target, tone-aware hover. */
export function IconButton({
  children,
  tone = "muted",
  label,
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "muted" | "accent" | "good" | "bad";
  /** Accessible name — also used as the tooltip. */
  label: string;
  size?: "sm" | "md";
}) {
  const tones = {
    muted: "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)]/50",
    accent: "text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]",
    good: "text-[var(--good)] hover:bg-[var(--good-soft)]",
    bad: "text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--bad-soft)]",
  };
  const dims = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center ${dims} rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * One dialog shell for the whole app. Backdrop click / Escape close it; the
 * page behind stops scrolling while it is open; on phones it rises from
 * the bottom as a sheet with a grab handle, on larger screens it is a
 * centred card. `size` only changes the max width.
 */
export function Modal({
  open = true,
  onClose,
  title,
  titleId,
  size = "sm",
  children,
  footer,
  zIndex = 50,
  className = "",
}: {
  open?: boolean;
  onClose: () => void;
  /** Rendered as the dialog heading — omit when the body supplies its own. */
  title?: ReactNode;
  titleId?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  /** Action row — wraps on narrow screens, right-aligned otherwise. */
  footer?: ReactNode;
  zIndex?: number;
  /** Extra classes on the panel (e.g. remove padding for an edge-to-edge header). */
  className?: string;
}) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "lg" ? "sm:max-w-2xl" : size === "md" ? "sm:max-w-md" : "sm:max-w-sm";

  return (
    <div
      className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-start justify-center sm:px-4 sm:py-6 animate-fade-in overflow-y-auto"
      style={{ zIndex }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        className={`sheet-panel ${width} sm:my-auto bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl sm:rounded-xl p-5 sm:p-6 flex flex-col gap-3 animate-slide-up sm:animate-scale-in ${className}`}
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" className="sm:hidden mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-[var(--line-strong)]/60" />
        {title && (
          <h2 id={headingId} className="font-serif text-xl text-[var(--ink)] m-0 leading-tight">
            {title}
          </h2>
        )}
        {children}
        {footer && <div className="flex flex-wrap justify-end gap-2 mt-1">{footer}</div>}
      </div>
    </div>
  );
}

/** Section eyebrow — the small uppercase label used above groups of content. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold ${className}`}>{children}</div>
  );
}

/** Empty-state placeholder: icon, headline, optional hint/action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4 animate-fade-in">
      {icon && (
        <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-xl">
          {icon}
        </div>
      )}
      <div className="text-[13.5px] font-semibold text-[var(--ink)]">{title}</div>
      {hint && <div className="text-[12px] text-[var(--muted)] max-w-[36ch] leading-snug">{hint}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
