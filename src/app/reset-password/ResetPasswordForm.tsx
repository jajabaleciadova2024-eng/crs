"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Reached via the link in either the "reset password" OR "invite" email —
// both land here. Supabase's browser client auto-detects the token in the
// URL (detectSessionInUrl, on by default) and turns it into a real
// (short-lived) session, but which auth event fires depends on the link
// type: password-reset links fire PASSWORD_RECOVERY, while invite links
// just fire SIGNED_IN (there's no invite-specific event). We treat any
// event that leaves us with a session as "ready" rather than special-casing
// PASSWORD_RECOVERY, so both flows work. Error out only if no session shows
// up within the grace period (genuinely expired/invalid link).
export default function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    // If a session already exists by the time this mounts (event fired
    // before the listener attached), don't leave the user stuck waiting.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    const timeout = setTimeout(() => {
      setReady((r) => {
        if (!r) setInvalid(true);
        return r;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/login");
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl text-[var(--ink)]">CRS Naga</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Set a new password</p>
        </div>

        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md p-6 flex flex-col gap-4">
          {invalid ? (
            <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
          ) : !ready ? (
            <p className="text-sm text-[var(--muted)] text-center">Verifying your reset link…</p>
          ) : done ? (
            <p className="text-sm text-[var(--good)] bg-[var(--good-soft)] rounded px-3 py-2">
              Password updated. Redirecting to sign in…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                disabled={saving}
                className="mt-1 w-full py-2.5 rounded bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
