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
    <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
        <h2 className="text-sm font-bold m-0">{title}</h2>
        {action ?? (hint && <span className="text-xs text-[var(--muted)]">{hint}</span>)}
      </div>
      <div className="px-4 pb-3.5 pt-1">{children}</div>
      {footnote && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--muted)] bg-[var(--paper)] border-t border-dashed border-[var(--line)]">
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-bold ${PILL_STYLES[tone]}`}
    >
      <span className="w-[5px] h-[5px] rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted)] mb-2">{label}</div>
      <div
        className="font-serif text-[26px] tabular-nums"
        style={tone === "warn" ? { color: "var(--warn)" } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <span className="inline-flex w-[26px] h-[26px] rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] items-center justify-center text-[10.5px] font-bold mr-2 shrink-0">
      {initials}
    </span>
  );
}

export function Button({
  children,
  variant = "ghost",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base = "px-3.5 py-1.5 rounded text-[12.5px] font-bold border";
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
      : "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] disabled:opacity-50";
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}
