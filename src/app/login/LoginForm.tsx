"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import RequestAccessModal from "./RequestAccessModal";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[var(--paper)] via-[var(--paper)] to-[var(--accent-soft)]/40 px-4 py-8 relative overflow-hidden">
      {/* Soft radial decoration — never intrusive, but gives the page
          some warmth on wider viewports. */}
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
          <p className="text-[13px] text-[var(--muted)] mt-1.5 font-medium tracking-wide">Field Operations</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-6 sm:p-7 flex flex-col gap-4"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
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
              placeholder=""
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
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
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded-lg px-3 py-2.5 animate-fade-in-up border border-[var(--bad)]/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50 shadow-sm hover:shadow"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-[var(--muted)] text-center pt-1">
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
      </div>

      {showRequestAccess && <RequestAccessModal onClose={() => setShowRequestAccess(false)} />}
    </div>
  );
}
