"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill, Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import type { AppRole, Profile } from "@/lib/database.types";

// Team Leader and OIC share the same pill color — role hierarchy isn't
// what the color is communicating, so there's no reason for OIC to stand
// out in a different tone than the role right above it.
const ROLE_TONE: Record<AppRole, "warn" | "accent"> = {
  team_leader: "warn",
  oic: "warn",
  associate: "accent",
};
const ROLE_LABEL: Record<AppRole, string> = { team_leader: "Team Leader", oic: "OIC", associate: "Associate" };

export default function MemberRow({ member, isSelf }: { member: Profile; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("profiles").update({ role }).eq("id", member.id);
      setEditing(false);
      router.refresh();
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("profiles").update({ is_active: !member.is_active }).eq("id", member.id);
      router.refresh();
    });
  }

  return (
    <tr className={member.is_active ? "" : "opacity-50"}>
      <td className="py-2.5 border-b border-[var(--line)]">
        <code className="bg-[var(--accent-soft)] text-[var(--accent-strong)] px-1.5 py-0.5 rounded text-[11.5px]">{member.psid}</code>
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">{formatFullName(member.first_name, member.last_name)}</td>
      <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{member.email}</td>
      <td className="py-2.5 border-b border-[var(--line)] text-[var(--muted)]">{member.mobile_number ?? "—"}</td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {editing ? (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
          >
            <option value="associate">Associate</option>
            <option value="oic">OIC</option>
            <option value="team_leader">Team Leader</option>
          </select>
        ) : (
          <Pill tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</Pill>
        )}
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
            {!isSelf && (
              <Button style={{ padding: "5px 10px" }} disabled={pending} onClick={toggleActive}>
                {member.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
