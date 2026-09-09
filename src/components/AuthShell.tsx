import type { ReactNode } from "react";

// Shared chrome for every screen outside the app shell (sign in, forgot /
// reset password, invite confirmation): full-height centred column, the
// soft radial backdrop, the CN mark and title, then a card. Keeping it in
// one place is what stops the four screens drifting apart in spacing and
// tone the way the confirm page had.
export default function AuthShell({
  tagline,
  children,
  footer,
}: {
  /** One line under the app name — what this screen is for. */
  tagline: string;
  children: ReactNode;
  /** Optional row under the card (e.g. "Back to sign in"). */
  footer?: ReactNode;
}) {
  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[var(--paper)] via-[var(--paper)] to-[var(--accent-soft)]/40 px-4 relative overflow-hidden"
      style={{
        paddingTop: "calc(2rem + var(--safe-top))",
        paddingBottom: "calc(2rem + var(--safe-bottom))",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 40%), radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 40%)",
        }}
      />

      <div className="w-full max-w-sm animate-fade-in-up relative">
        <div className="mb-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)] text-[var(--on-accent)] mb-3 shadow-lg">
            <span className="font-serif font-bold text-2xl leading-none">CN</span>
          </div>
          <h1 className="font-serif text-[28px] text-[var(--ink)] tracking-tight leading-none">CRS Naga</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1.5 font-medium tracking-wide">{tagline}</p>
        </div>

        <div
          className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-6 sm:p-7 flex flex-col gap-4"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          {children}
        </div>

        {footer && <div className="mt-4 text-center">{footer}</div>}
      </div>
    </div>
  );
}

/** Uppercase field label used on every auth form. */
export function AuthLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
      {children}
    </label>
  );
}

export const AUTH_INPUT_CLASS =
  "w-full px-3.5 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm";

/** Inline error/success message with the matching soft background. */
export function AuthNotice({ tone = "bad", children }: { tone?: "bad" | "good"; children: ReactNode }) {
  const cls =
    tone === "good"
      ? "text-[var(--good)] bg-[var(--good-soft)] border-[var(--good)]/20"
      : "text-[var(--bad)] bg-[var(--bad-soft)] border-[var(--bad)]/20";
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={`text-sm rounded-lg px-3 py-2.5 border animate-fade-in-up m-0 ${cls}`}>
      {children}
    </p>
  );
}
