"use client";

import { useState, type FormEvent } from "react";

export default function RequestAccessModal({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <h2 className="font-serif text-xl text-[var(--ink)]">Request sent</h2>
            <p className="text-sm text-[var(--muted)]">
              Your Team Leader will review it. If approved, you&apos;ll get the same invite email as any new
              member — check your inbox once they&apos;ve accepted.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)]"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-serif text-xl text-[var(--ink)] m-0">Request access</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--muted)] text-lg leading-none">
                ×
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] -mt-2 mb-1">
              Your Team Leader will review this and reach out by email once it&apos;s approved.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">First name</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">
                  Middle name <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Last name</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">
                Mobile number <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">
                Note to your Team Leader <span className="normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full py-2.5 rounded bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
