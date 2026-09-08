"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import AuthShell, { AuthLabel, AuthNotice, AUTH_INPUT_CLASS } from "@/components/AuthShell";
import RequestAccessModal from "./RequestAccessModal";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRequestAccess, setShowRequestAccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    let email = identifier.trim();

    // If it doesn't look like an email, treat it as a PSID and resolve it.
    if (!email.includes("@")) {
      const { data, error: lookupError } = await supabase.rpc("email_for_psid", {
        lookup_psid: email,
      });

      if (lookupError || !data) {
        setError("We couldn't find an account with that PSID.");
        setLoading(false);
        return;
      }
      email = data;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError("Incorrect PSID/email or password.");
      return;
    }

    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell tagline="Field Operations">
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
            className={AUTH_INPUT_CLASS}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Password
            </label>
            <Link href="/forgot-password" className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${AUTH_INPUT_CLASS} pr-11`}
            />
            {/* Show/hide — typing a password blind on a phone keyboard is
                the #1 cause of "wrong password" on the login page. */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)]/50"
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-4.06 5.34" />
                  <path d="M1 1l22 22" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && <AuthNotice>{error}</AuthNotice>}

        <Button type="submit" variant="primary" size="lg" block loading={loading} className="mt-1">
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-xs text-[var(--muted)] text-center pt-1 m-0">
          New here?{" "}
          <button
            type="button"
            onClick={() => setShowRequestAccess(true)}
            className="font-bold text-[var(--accent-strong)] hover:underline"
          >
            Request access
          </button>
        </p>
      </form>

      {showRequestAccess && <RequestAccessModal onClose={() => setShowRequestAccess(false)} />}
    </AuthShell>
  );
}
