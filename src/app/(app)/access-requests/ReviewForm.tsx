"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Access requests are always approved as Associate — Team Leader/OIC
// accounts are only ever created directly from /team, never through
// self-service. Only PSID needs assigning here.
export default function ReviewForm({ requestId }: { requestId: string }) {
  const [approving, setApproving] = useState(false);
  const [psid, setPsid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approve() {
    if (!psid.trim()) {
      setError("PSID is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/access-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psid: psid.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't approve this request.");
        return;
      }
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      await fetch(`/api/access-requests/${requestId}/reject`, { method: "POST" });
      router.refresh();
    });
  }

  if (!approving) {
    return (
      <div className="flex gap-1.5">
        <Button variant="primary" style={{ padding: "5px 10px" }} onClick={() => setApproving(true)}>
          Approve
        </Button>
        <Button style={{ padding: "5px 10px" }} disabled={pending} onClick={reject}>
          Reject
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <div className="flex gap-1.5">
        <input
          value={psid}
          onChange={(e) => setPsid(e.target.value)}
          placeholder="PSID"
          className="w-24 text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
        />
        <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pending} onClick={approve}>
          {pending ? "Inviting…" : "Confirm as Associate"}
        </Button>
        <Button style={{ padding: "5px 10px" }} onClick={() => setApproving(false)}>
          Cancel
        </Button>
      </div>
      {error && <span className="text-xs text-[var(--bad)]">{error}</span>}
    </div>
  );
}
