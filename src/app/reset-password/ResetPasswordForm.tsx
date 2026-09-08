"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Spinner } from "@/components/ui";
import AuthShell, { AuthLabel, AuthNotice, AUTH_INPUT_CLASS } from "@/components/AuthShell";

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

  // Live strength hint — the two rules we actually enforce, shown before
  // the submit button rejects them.
  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;

  return (
    <AuthShell tagline="Set a new password">
      {invalid ? (
        <AuthNotice>This reset link is invalid or has expired. Request a new one from the sign-in page.</AuthNotice>
      ) : !ready ? (
        <p className="text-sm text-[var(--muted)] text-center py-2 m-0 inline-flex items-center justify-center gap-2">
          <Spinner /> Verifying your reset link…
        </p>
      ) : done ? (
        <AuthNotice tone="good">Password updated. Redirecting to sign in…</AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <AuthLabel htmlFor="password">New password</AuthLabel>
            <input
              id="password"
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div>
            <AuthLabel htmlFor="confirm">Confirm password</AuthLabel>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>

          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[11.5px]">
            <li className={`flex items-center gap-1.5 ${longEnough ? "text-[var(--good)]" : "text-[var(--muted)]"}`}>
              <span aria-hidden="true">{longEnough ? "✓" : "•"}</span> At least 8 characters
            </li>
            <li className={`flex items-center gap-1.5 ${matches ? "text-[var(--good)]" : "text-[var(--muted)]"}`}>
              <span aria-hidden="true">{matches ? "✓" : "•"}</span> Both entries match
            </li>
          </ul>

          {error && <AuthNotice>{error}</AuthNotice>}

          <Button type="submit" variant="primary" size="lg" block loading={saving} className="mt-1">
            {saving ? "Saving…" : "Set new password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
