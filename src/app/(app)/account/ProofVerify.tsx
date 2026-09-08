"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProofViewer from "@/components/ProofViewer";

export default function ProofVerify({
  kind,
  profileId,
  hasProof,
  verified,
  required,
  memberName,
}: {
  kind: "mfa" | "passkey";
  profileId: string;
  hasProof: boolean;
  verified: boolean;
  required: boolean;
  memberName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(ok: boolean, reviewNote?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/verify-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, kind, verified: ok, review_note: reviewNote ?? null }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    setRejecting(false);
    setNote("");
    router.refresh();
  }

  // No proof uploaded
  if (!hasProof) {
    return (
      <span className="inline-flex items-center justify-center" title={required ? "Missing — required" : "None uploaded"}>
        {required ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </span>
    );
  }

  // Rejecting — inline form
  if (rejecting) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          placeholder="What's wrong?"
          className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper)] text-[11.5px] w-[140px]"
        />
        <button
          type="button"
          disabled={!note.trim() || busy}
          onClick={() => send(false, note.trim())}
          className="px-2 py-1 rounded text-[10.5px] font-bold bg-[var(--bad)] text-[var(--on-accent)] cursor-pointer disabled:opacity-40"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => setRejecting(false)}
          className="text-[10.5px] font-bold text-[var(--muted)] cursor-pointer"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {/* Status icon */}
      {verified ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      {/* View proof */}
      <ProofViewer
        fetchUrl={`/api/account/credential-proof?kind=${kind}${profileId ? `&profile_id=${profileId}` : ""}`}
        title={kind === "mfa" ? "MFA screenshot" : "Passkey screenshot"}
        subtitle={memberName}
      />
      {/* Verify / reject actions (only when not yet verified) */}
      {!verified && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send(true)}
          title="Verify this screenshot"
          className="inline-flex items-center justify-center w-6 h-6 rounded bg-[var(--good)] text-[var(--on-accent)] hover:opacity-90 cursor-pointer disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={() => setRejecting(true)}
        title={verified ? "Reject — member re-uploads" : "Reject with a reason"}
        className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--muted)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)] transition-colors cursor-pointer"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </span>
  );
}
