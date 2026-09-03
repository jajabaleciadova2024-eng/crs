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
}: {
  kind: "mfa" | "passkey";
  label: string;
  priority: string;
  required: boolean;
  hasProof: boolean;
  verified: boolean;
  reviewNote: string | null;
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
    <div className="flex flex-wrap items-center gap-2 py-1">
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
      <span className="text-[12.5px] font-semibold text-[var(--ink)] min-w-[130px]">{label}</span>
      <span className="text-[11px] text-[var(--muted)]">{priority}</span>
      {hasProof ? (
        <>
          {/* Three states, not two. A tick means the Team Leader checked it;
              an upload on its own only means a file exists. */}
          {verified ? (
            <Pill tone="good">Verified</Pill>
          ) : reviewNote ? (
            <Pill tone="bad">Rejected</Pill>
          ) : (
            <Pill tone="warn">Awaiting TL check</Pill>
          )}
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
        <>
          <Pill tone={required ? "bad" : "warn"}>{required ? "Required" : "Recommended"}</Pill>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? "Uploading…" : "📷 Upload screenshot"}
          </button>
        </>
      )}
      {/* The Team Leader's reason, so a rejected proof says what to fix
          rather than just going red. */}
      {hasProof && !verified && reviewNote && (
        <span className="w-full text-[11.5px] text-[var(--bad)] leading-snug">
          {reviewNote} — upload a corrected one.
        </span>
      )}
      {error && <span className="text-[11.5px] text-[var(--bad)] w-full">{error}</span>}
    </div>
  );
}
