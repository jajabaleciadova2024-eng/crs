"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function ApprovalActions({ requestId, reviewerId }: { requestId: string; reviewerId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(status: "approved" | "rejected") {
    startTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("leave_requests")
        .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
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
