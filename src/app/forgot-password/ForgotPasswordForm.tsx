"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import AuthShell, { AuthLabel, AuthNotice, AUTH_INPUT_CLASS } from "@/components/AuthShell";

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

  const back = (
    <Link href="/login" className="text-xs font-bold text-[var(--muted)] hover:text-[var(--accent-strong)]">
      ← Back to sign in
    </Link>
  );

  return (
    <AuthShell tagline="Reset your password" footer={back}>
      {sent ? (
        <>
          <AuthNotice tone="good">
            If that PSID or email matches an account, we&apos;ve sent a password reset link to the associated
            email address.
          </AuthNotice>
          <p className="text-xs text-[var(--muted)] m-0 text-center">Check your inbox — and the spam folder.</p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <AuthLabel htmlFor="identifier">PSID or Email</AuthLabel>
            <input
              id="identifier"
              type="text"
              required
              autoFocus
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="123456 or your personal email"
              className={AUTH_INPUT_CLASS}
            />
          </div>

          {error && <AuthNotice>{error}</AuthNotice>}

          <Button type="submit" variant="primary" size="lg" block loading={loading} className="mt-1">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
