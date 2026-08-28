"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill, Button } from "@/components/ui";
import type { Workstation, WorkstationWindow } from "@/lib/database.types";
import WindowManager from "./WindowManager";

export default function WorkstationRow({
  workstation,
  windows,
}: {
  workstation: Workstation;
  windows: WorkstationWindow[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workstation.name);
  const [headcount, setHeadcount] = useState(workstation.headcount);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("workstations").update({ name, headcount }).eq("id", workstation.id);
      setEditing(false);
      router.refresh();
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("workstations").update({ is_active: !workstation.is_active }).eq("id", workstation.id);
      router.refresh();
    });
  }

  return (
    <tr className={workstation.is_active ? "" : "opacity-50"}>
      <td className="py-2.5 border-b border-[var(--line)] font-medium">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)] w-full"
          />
        ) : (
          workstation.name
        )}
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {editing ? (
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value)))}
            className="text-sm border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)] w-16"
          />
        ) : (
          <Pill tone="accent">{workstation.headcount} seat{workstation.headcount === 1 ? "" : "s"}</Pill>
        )}
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        <WindowManager workstationId={workstation.id} windows={windows} />
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        <Pill tone={workstation.is_active ? "good" : "muted"}>{workstation.is_active ? "Active" : "Retired"}</Pill>
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {editing ? (
          <div className="flex gap-1.5">
            <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pending} onClick={save}>
              Save
            </Button>
            <Button style={{ padding: "5px 10px" }} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button style={{ padding: "5px 10px" }} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button style={{ padding: "5px 10px" }} disabled={pending} onClick={toggleActive}>
              {workstation.is_active ? "Retire" : "Reactivate"}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
