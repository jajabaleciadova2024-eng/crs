import type { ReactNode } from "react";

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
