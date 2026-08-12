"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { AppRole } from "@/lib/database.types";

export default function ReviewForm({ requestId }: { requestId: string }) {
  const [approving, setApproving] = useState(false);
  const [psid, setPsid] = useState("");
  const [role, setRole] = useState<AppRole>("associate");
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
        body: JSON.stringify({ psid: psid.trim(), role }),
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
          className="w-20 text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
        >
          <option value="associate">Associate</option>
          <option value="oic">OIC</option>
          <option value="team_leader">Team Leader</option>
        </select>
        <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pending} onClick={approve}>
          {pending ? "Inviting…" : "Confirm"}
        </Button>
        <Button style={{ padding: "5px 10px" }} onClick={() => setApproving(false)}>
          Cancel
        </Button>
      </div>
      {error && <span className="text-xs text-[var(--bad)]">{error}</span>}
    </div>
  );
}
