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
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl text-[var(--ink)] tracking-tight">CRS Naga</h1>
          <p className="text-sm text-[var(--muted)] mt-1.5 font-medium">Field Operations</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-7 flex flex-col gap-4"
          style={{ boxShadow: "var(--shadow-md)" }}
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
              className="w-full px-3 py-2.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
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
              className="w-full px-3 py-2.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded-md px-3 py-2.5 animate-fade-in-up">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full py-2.5 rounded-md bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-[var(--muted)] text-center">
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
