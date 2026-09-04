"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProofViewer from "@/components/ProofViewer";

// Verify / reject one member's MFA or passkey screenshot.
//
// A tick has to mean the Team Leader looked at it. Until then the proof sits
// as "needs check" — which, for MFA, also holds up confirming that member's
// password reset.
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
  /** Whose screenshot it is — named in the viewer, so verifying a row means
      checking a proof you can see belongs to that person. */
  memberName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  async function send(ok: boolean, reviewNote?: string) {
    setBusy(true);
    await fetch("/api/account/verify-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, kind, verified: ok, review_note: reviewNote ?? null }),
    });
    setBusy(false);
    setRejecting(false);
    setNote("");
    router.refresh();
  }

  if (!hasProof) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
          required ? "bg-[var(--bad-soft)] text-[var(--bad)]" : "bg-[var(--paper)] text-[var(--muted)]"
        }`}
      >
        {required ? "Missing" : "None"}
      </span>
    );
  }

  if (rejecting) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
          placeholder="What's wrong with it?"
          className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper)] text-[11.5px] w-[170px]"
        />
        <button
          type="button"
          disabled={!note.trim() || busy}
          onClick={() => send(false, note.trim())}
          className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white cursor-pointer disabled:opacity-40"
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {verified ? (
        <span className="text-[var(--good)] font-bold text-[11px]">✓ Verified</span>
      ) : (
        <span className="text-[11px] font-bold text-[var(--warn)]">Needs check</span>
      )}
      <ProofViewer
        fetchUrl={`/api/account/credential-proof?kind=${kind}${profileId ? `&profile_id=${profileId}` : ""}`}
        title={kind === "mfa" ? "MFA screenshot" : "Passkey screenshot"}
        subtitle={memberName}
      />
      {!verified && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send(true)}
          className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-[var(--good)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
        >
          Verify
        </button>
      )}
      <button
        type="button"
        onClick={() => setRejecting(true)}
        title="Reject with a reason — the member re-uploads"
        className="text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer"
      >
        ✕
      </button>
    </span>
  );
}
