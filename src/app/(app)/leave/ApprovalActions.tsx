"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function ApprovalActions({ requestId }: { requestId: string; reviewerId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(status: "approved" | "rejected") {
    startTransition(async () => {
      await fetch(`/api/leave/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1.5">
      <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pending} onClick={() => decide("approved")}>
        Approve
      </Button>
      <Button style={{ padding: "5px 10px" }} disabled={pending} onClick={() => decide("rejected")}>
        Reject
      </Button>
    </div>
  );
}
