"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

// Landing page for BOTH invite and password-reset emails. Deliberately does
// NOT auto-consume the one-time token on page load — the Supabase email
// templates point here with ?token_hash=...&type=..., and we only call
// verifyOtp() when the person clicks the button below.
//
// Why: Supabase's default flow (linking straight to their /verify endpoint,
// or auto-firing verifyOtp on mount) is a plain GET request, which some
// email security scanners / antivirus / mail clients pre-fetch to check for
// phishing — that GET silently consumes the one-time token before the real
// human ever clicks, so their actual click then fails with "invalid or
// expired" even though nothing is actually wrong. Requiring an explicit
// button click means a prefetch bot (which only fetches HTML, it doesn't
// click buttons or run the resulting fetch) can't burn the token.
export default function AuthConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  async function confirm() {
    if (!tokenHash || !type) {
      setError("This link is missing information it needs — please request a new one.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    setLoading(false);

    if (verifyError) {
      setError("This link is invalid or has expired. Request a new one from the sign-in page.");
      return;
    }

    router.push("/reset-password");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl text-[var(--ink)]">CRS Naga</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {type === "invite" ? "Confirm your invitation" : "Confirm this request"}
          </p>
        </div>

        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md p-6 flex flex-col gap-4">
          {!tokenHash || !type ? (
            <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              This link is missing information it needs — please request a new one from the sign-in page.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--ink)]">
                {type === "invite"
                  ? "Click below to confirm your account and set your password."
                  : "Click below to confirm and set a new password."}
              </p>

              {error && (
                <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={confirm}
                disabled={loading}
                className="mt-1 w-full py-2.5 rounded bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {loading ? "Confirming…" : "Continue"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
