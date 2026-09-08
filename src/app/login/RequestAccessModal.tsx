"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { AuthNotice } from "@/components/AuthShell";

const FIELD = "w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm";
const LABEL = "block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5";

export default function RequestAccessModal({ onClose }: { onClose: () => void }) {
  const [psid, setPsid] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Escape closes; background stays put while the sheet is open.
  useEffect(() => {
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
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!psid.trim() || !firstName.trim() || !lastName.trim() || !email.trim() || !mobile.trim()) {
      setError("PSID, first name, last name, email, and mobile number are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psid: psid.trim(),
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        email: email.trim(),
        mobile_number: mobile.trim() || null,
        message: message.trim() || null,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't submit your request. Please try again.");
      return;
    }

    setSent(true);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:px-4 sm:py-6 z-50 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-access-title"
        className="sheet-panel sm:max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 animate-slide-up sm:animate-scale-in"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — signals "this is a sheet you can dismiss" on phones. */}
        <div aria-hidden="true" className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line-strong)]/60" />

        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[var(--good-soft)] text-[var(--good)] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 id="request-access-title" className="font-serif text-xl text-[var(--ink)] m-0">Request sent</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              Your Team Leader will review it. If approved, you&apos;ll get the same invite email as any new
              member — check your inbox once they&apos;ve accepted.
            </p>
            <Button type="button" variant="primary" size="lg" block onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 id="request-access-title" className="font-serif text-xl text-[var(--ink)] m-0">Request access</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center w-8 h-8 -mr-1 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] -mt-2 mb-1">
              Your Team Leader will review this and reach out by email once it&apos;s approved.
            </p>

            <div>
              <label htmlFor="ra-psid" className={LABEL}>PSID</label>
              <input id="ra-psid" required inputMode="numeric" autoComplete="off" value={psid} onChange={(e) => setPsid(e.target.value)} className={FIELD} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ra-first" className={LABEL}>First name</label>
                <input id="ra-first" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="ra-middle" className={LABEL}>
                  Middle name <span className="normal-case font-normal">(optional)</span>
                </label>
                <input id="ra-middle" autoComplete="additional-name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={FIELD} />
              </div>
            </div>

            <div>
              <label htmlFor="ra-last" className={LABEL}>Last name</label>
              <input id="ra-last" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={FIELD} />
            </div>

            <div>
              <label htmlFor="ra-email" className={LABEL}>Email</label>
              <input id="ra-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
            </div>

            <div>
              <label htmlFor="ra-mobile" className={LABEL}>Mobile number</label>
              <input id="ra-mobile" required type="tel" autoComplete="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className={FIELD} />
            </div>

            <div>
              <label htmlFor="ra-note" className={LABEL}>
                Note to your Team Leader <span className="normal-case font-normal">(optional)</span>
              </label>
              <textarea id="ra-note" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={`${FIELD} resize-none`} />
            </div>

            {error && <AuthNotice>{error}</AuthNotice>}

            <Button type="submit" variant="primary" size="lg" block loading={submitting} className="mt-1">
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
