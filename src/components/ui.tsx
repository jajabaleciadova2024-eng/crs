import type { ReactNode } from "react";

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
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        {title && <h1 className="font-serif text-2xl m-0 mb-1">{title}</h1>}
        {subtitle && <p className="text-sm text-[var(--muted)] m-0">{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  return (
    <>
      {/* Space-reserving clone — invisible but still laid out, so the
          fixed header (removed from flow) doesn't cause content below it
          to jump up underneath it. Same content/width as the visible
          copy so its height always matches, however long a given page's
          title/subtitle/action ends up being. */}
      <div aria-hidden="true" className="invisible px-4 md:px-10 py-4 md:py-5 mb-6 border-b border-transparent">
        {content}
      </div>
      <header className="fixed z-20 top-[calc(52px+var(--preview-offset,0px))] md:top-[var(--preview-offset,0px)] left-0 md:left-[var(--sidebar-width,220px)] w-full md:w-[calc(100%-var(--sidebar-width,220px))] max-w-[1000px] px-4 md:px-10 py-4 md:py-5 bg-[var(--paper)]/95 backdrop-blur-sm border-b border-[var(--line)] transition-[left,width,top] duration-200 ease-out">
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
    <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg mb-4 overflow-hidden animate-fade-in-up" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--line)]">
        <h2 className="text-sm font-bold m-0 tracking-tight">{title}</h2>
        {action ?? (hint && <span className="text-xs text-[var(--muted)] font-medium">{hint}</span>)}
      </div>
      <div className="px-5 pb-4 pt-2">{children}</div>
      {footnote && (
        <div className="flex items-center gap-2 px-5 py-2.5 text-xs text-[var(--muted)] bg-[var(--paper)] border-t border-dashed border-[var(--line)] leading-relaxed">
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${PILL_STYLES[tone]}`}
    >
      <span className="w-[5px] h-[5px] rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

export function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg px-4 py-4 hover:border-[var(--accent)] transition-colors"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">{label}</div>
      <div
        className="font-serif text-[28px] tabular-nums leading-tight"
        style={tone === "warn" ? { color: "var(--warn)" } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--muted)] mt-1">{sub}</div>}
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
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base = "px-3.5 py-1.5 rounded-md text-[12.5px] font-bold border cursor-pointer";
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow-xs)]"
      : "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] hover:shadow-[var(--shadow-xs)] disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}
