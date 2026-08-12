"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    let email = identifier.trim();

    // Same PSID-or-email resolution as the login form.
    if (email && !email.includes("@")) {
      const { data, error: lookupError } = await supabase.rpc("email_for_psid", {
        lookup_psid: email,
      });
      if (lookupError || !data) {
        // Don't reveal whether the PSID exists — show the same generic
        // confirmation as a successful send.
        setLoading(false);
        setSent(true);
        return;
      }
      email = data;
    }

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl text-[var(--ink)]">CRS Naga</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Reset your password</p>
        </div>

        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md p-6 flex flex-col gap-4">
          {sent ? (
            <>
              <p className="text-sm text-[var(--ink)]">
                If that PSID or email matches an account, we&apos;ve sent a password reset link to the
                associated email address. Check your inbox (and spam folder).
              </p>
              <Link href="/login" className="text-sm text-[var(--accent-strong)] font-bold text-center">
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="identifier" className="block text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">
                  PSID or Email
                </label>
                <input
                  id="identifier"
                  type="text"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="PS-1042 or you@agency.gov"
                  className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-2.5 rounded bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <Link href="/login" className="text-xs text-[var(--muted)] text-center">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
