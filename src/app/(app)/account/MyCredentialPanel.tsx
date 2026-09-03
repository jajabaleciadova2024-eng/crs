"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Pill } from "@/components/ui";
import PasswordCountdown from "@/components/PasswordCountdown";
import { expiryState, expiryFrom, BLOCK_WITHIN_DAYS } from "@/lib/passwordExpiry";
import ProofLink from "./ProofLink";

type Reset = { id: string; resetAt: string; status: string; reviewNote: string | null; hasProof: boolean };

const BANNER: Record<string, { text: string; tone: "good" | "warn" | "bad" }> = {
  ok: { text: "Your password is in good standing.", tone: "good" },
  warning: { text: "Your password expires soon — reset it before it bites.", tone: "warn" },
  blocking: {
    text: `Inside the final ${BLOCK_WITHIN_DAYS} days: your upcoming schedule is locked until this is reset and confirmed.`,
    tone: "bad",
  },
  expired: { text: "Your password has expired. Reset it on the platform now.", tone: "bad" },
  unset: { text: "No reset on record yet — ask your Team Leader to set your baseline.", tone: "bad" },
};

export default function MyCredentialPanel({
  lastResetAt,
  mfa,
  passkey,
  pending,
  history,
}: {
  lastResetAt: string | null;
  mfa: boolean;
  passkey: boolean;
  pending: { id: string; resetAt: string } | null;
  history: Reset[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resetDate, setResetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const fileRef = useRef<HTMLInputElement>(null);

  const state = expiryState(lastResetAt);
  const banner = BANNER[state];
  const expiry = expiryFrom(lastResetAt);

  function choose(f: File) {
    if (preview) URL.revokeObjectURL(preview);
    setProof(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function submit() {
    if (!proof) {
      setError("Attach a screenshot showing the reset.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("proof", proof);
    fd.append("reset_at", new Date(`${resetDate}T00:00:00`).toISOString());
    const res = await fetch("/api/account/reset", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't submit.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setProof(null);
    setPreview(null);
    router.refresh();
  }

  async function setFlag(which: "mfa_configured" | "passkey_configured", value: boolean) {
    setBusy(true);
    await fetch("/api/account/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [which]: value }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Panel title="My account" hint="Password expires 60 days after each reset">
      <div className="flex flex-col gap-4">
        {/* Countdown — the thing this page exists for. */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">
              Time until expiry
            </div>
            <PasswordCountdown lastResetAt={lastResetAt} size="lg" />
            <div className="text-[10.5px] text-[var(--muted)] mt-1 font-mono">DD : HH : MM : SS</div>
          </div>
          <div className="text-[12px] text-[var(--muted)]">
            {expiry ? (
              <>
                Expires{" "}
                <span className="text-[var(--ink)] font-semibold">
                  {expiry.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </>
            ) : (
              "No reset on record"
            )}
          </div>
        </div>

        <div
          className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{
            background:
              banner.tone === "good"
                ? "var(--good-soft)"
                : banner.tone === "warn"
                  ? "var(--warn-soft)"
                  : "var(--bad-soft)",
            color:
              banner.tone === "good" ? "var(--good)" : banner.tone === "warn" ? "var(--warn)" : "var(--bad)",
          }}
        >
          {banner.text}
        </div>

        {/* MFA / passkey — both mandatory, MFA first. */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">
            Required setup
          </div>
          {[
            { key: "mfa_configured" as const, label: "MFA configured", val: mfa, order: "1st priority" },
            { key: "passkey_configured" as const, label: "Passkey configured", val: passkey, order: "2nd priority" },
          ].map((f) => (
            <label key={f.key} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={f.val}
                disabled={busy}
                onChange={(e) => setFlag(f.key, e.target.checked)}
                className="w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12.5px] text-[var(--ink)] font-medium">{f.label}</span>
              <span className="text-[11px] text-[var(--muted)]">{f.order}</span>
              {!f.val && <Pill tone="bad">Required</Pill>}
            </label>
          ))}
        </div>

        {/* Reset claim */}
        <div className="border-t border-[var(--line)] pt-3.5">
          {pending ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Pill tone="warn">Awaiting Team Leader confirmation</Pill>
              <span className="text-[var(--muted)]">
                You reported a reset on{" "}
                {new Date(pending.resetAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}.
                The countdown restarts once it is confirmed.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-semibold text-[var(--ink)]">
                Reset your password on the platform, then report it here
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) choose(f);
                }}
              />
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="text-[11.5px] font-semibold text-[var(--ink)]" htmlFor="reset-date">
                  Reset on
                </label>
                <input
                  id="reset-date"
                  type="date"
                  value={resetDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setResetDate(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[12px] text-[var(--ink)]"
                />
                {proof ? (
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview ?? ""} alt="" className="w-9 h-9 rounded object-cover border border-[var(--line)]" />
                    <span className="text-[12px] text-[var(--ink)] max-w-[150px] truncate">{proof.name}</span>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-md text-[11.5px] font-bold border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                  >
                    📷 Attach screenshot
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !proof}
                  className="px-3 py-1.5 rounded-md text-[11.5px] font-bold bg-[var(--accent)] text-white hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Submitting…" : "Password Reset Complete"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-[12px] text-[var(--bad)] mt-2 mb-0">
              {error}
            </p>
          )}
        </div>

        {history.length > 0 && (
          <div className="border-t border-[var(--line)] pt-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
              My reset history
            </div>
            <div className="flex flex-col gap-1.5">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="text-[var(--ink)]">
                    {new Date(h.resetAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  <Pill tone={h.status === "approved" ? "good" : h.status === "rejected" ? "bad" : "warn"}>
                    {h.status === "approved" ? "Confirmed" : h.status === "rejected" ? "Rejected" : "Pending"}
                  </Pill>
                  {h.hasProof && <ProofLink resetId={h.id} />}
                  {h.reviewNote && <span className="text-[var(--muted)]">{h.reviewNote}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
