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
          <p className="text-[13px] text-[var(--muted)] mt-1.5 font-medium tracking-wide">Set a new password</p>
        </div>

        <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-6 sm:p-7 flex flex-col gap-4" style={{ boxShadow: "var(--shadow-lg)" }}>
          {invalid ? (
            <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded-lg px-3 py-2.5 border border-[var(--bad)]/20">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
          ) : !ready ? (
            <p className="text-sm text-[var(--muted)] text-center py-2">Verifying your reset link…</p>
          ) : done ? (
            <p className="text-sm text-[var(--good)] bg-[var(--good-soft)] rounded-lg px-3 py-2.5 border border-[var(--good)]/20">
              Password updated. Redirecting to sign in…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                disabled={saving}
                className="mt-1 w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-strong)] disabled:opacity-50 shadow-sm hover:shadow"
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
