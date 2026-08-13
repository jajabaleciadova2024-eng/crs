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
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[var(--paper)] via-[var(--paper)] to-[var(--accent-soft)]/40 px-4 py-8 relative overflow-hidden">
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)] text-white mb-3 shadow-lg">
            <span className="font-serif font-bold text-2xl leading-none">CN</span>
          </div>
          <h1 className="font-serif text-[28px] text-[var(--ink)] tracking-tight leading-none">CRS Naga</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1.5 font-medium tracking-wide">Reset your password</p>
        </div>

        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-6 sm:p-7 flex flex-col gap-4" style={{ boxShadow: "var(--shadow-lg)" }}>
          {sent ? (
            <>
              <p className="text-sm text-[var(--ink)] leading-relaxed">
                If that PSID or email matches an account, we&apos;ve sent a password reset link to the
                associated email address. Check your inbox (and spam folder).
              </p>
              <Link href="/login" className="text-sm text-[var(--accent-strong)] font-bold text-center hover:underline">
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="identifier" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  PSID or Email
                </label>
                <input
                  id="identifier"
                  type="text"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="123456 or your personal email"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded-lg px-3 py-2.5 border border-[var(--bad)]/20">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50 shadow-sm hover:shadow"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <Link href="/login" className="text-xs text-[var(--muted)] text-center hover:text-[var(--ink)]">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
