"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets the Team Leader strip a wrong proof off someone's record, which
// forces them to upload a correct one. Removing an MFA proof re-blocks that
// member from reporting a reset, so it asks first — this is not an undo.
export default function ProofRemove({ kind, profileId }: { kind: "mfa" | "passkey"; profileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/account/credential-proof?kind=${kind}&profile_id=${profileId}`, { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-[10.5px] font-bold text-[var(--bad)] hover:underline cursor-pointer disabled:opacity-50"
        >
          {busy ? "…" : "Really remove"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[10.5px] font-bold text-[var(--muted)] cursor-pointer"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={
        kind === "mfa"
          ? "Remove — this re-blocks them until they upload a correct MFA screenshot"
          : "Remove this passkey screenshot"
      }
      className="text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer"
    >
      ✕
    </button>
  );
}
