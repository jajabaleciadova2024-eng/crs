"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import ProofImage from "./ProofImage";

// One "upload your screenshot" row. MFA is required and gates the reset
// flow; the passkey is wanted but never blocks anything, so the two differ
// only in how a missing proof is labelled.
export default function CredentialProofRow({
  kind,
  label,
  priority,
  required,
  hasProof,
  verified,
  reviewNote,
  isTeamLeader,
}: {
  kind: "mfa" | "passkey";
  label: string;
  priority: string;
  required: boolean;
  hasProof: boolean;
  verified: boolean;
  reviewNote: string | null;
  // The Team Leader is the one who checks these, so "awaiting TL check" on
  // their own row reads as waiting on somebody else.
  isTeamLeader: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/account/credential-proof?kind=${kind}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't remove it.");
      return;
    }
    router.refresh();
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("proof", file);
    const res = await fetch("/api/account/credential-proof", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't upload.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 sm:grid sm:grid-cols-[100px_150px_1fr_auto]">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />

      {/* min-width keeps MFA and Passkey lined up while wrapping on a
          phone, where the grid columns are off. */}
      <span className="min-w-[62px] sm:min-w-0 text-[12.5px] font-semibold text-[var(--ink)]">{label}</span>
      <span className="hidden sm:block text-[11px] text-[var(--muted)]">{priority}</span>

      <span className="sm:justify-self-start">
        {hasProof ? (
          // Three states, not two. A tick means the Team Leader checked it;
          // an upload on its own only means a file exists.
          verified ? (
            <Pill tone="good">Verified</Pill>
          ) : reviewNote ? (
            <Pill tone="bad">Rejected</Pill>
          ) : (
            <Pill tone="warn">{isTeamLeader ? "Needs your check" : "Awaiting TL check"}</Pill>
          )
        ) : (
          // Amber on an OPTIONAL item reads as a fault; the passkey is a
          // nice-to-have, so it stays neutral until it matters.
          <Pill tone={required ? "bad" : "muted"}>{required ? "Required" : "Recommended"}</Pill>
        )}
      </span>

      <span className="ml-auto sm:ml-0 sm:justify-self-end flex items-center gap-2.5">
        {hasProof ? (
          <>
            <ProofImage kind={kind} label="View" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              title={
                required
                  ? "Removing this will block you from reporting a reset until you upload a new one"
                  : "Remove this screenshot"
              }
              className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? "Uploading…" : "📷 Upload screenshot"}
          </button>
        )}
      </span>

      {/* The Team Leader's reason, so a rejected proof says what to fix
          rather than just going red. */}
      {hasProof && !verified && reviewNote && (
        <span className="w-full sm:col-span-full text-[11.5px] text-[var(--bad)] leading-snug">
          {reviewNote} — upload a corrected one.
        </span>
      )}
      {error && <span className="w-full sm:col-span-full text-[11.5px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}
