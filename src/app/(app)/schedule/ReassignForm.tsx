"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import type { Profile } from "@/lib/database.types";

export default function ReassignForm({
  assignmentId,
  workstationName,
  associates,
  currentAssociateId,
}: {
  assignmentId: string;
  workstationName: string;
  associates: Pick<Profile, "id" | "first_name" | "last_name">[];
  currentAssociateId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentAssociateId);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} style={{ padding: "5px 10px" }}>
        Reassign
      </Button>
    );
  }

  function handleSave() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("assignments").update({ associate_id: selected }).eq("id", assignmentId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
        aria-label={`Reassign ${workstationName}`}
      >
        {associates.map((a) => (
          <option key={a.id} value={a.id}>
            {formatFullName(a.first_name, a.last_name)}
          </option>
        ))}
      </select>
      <Button variant="primary" onClick={handleSave} disabled={pending} style={{ padding: "5px 10px" }}>
        Save
      </Button>
      <Button onClick={() => setOpen(false)} style={{ padding: "5px 10px" }}>
        Cancel
      </Button>
    </div>
  );
}
