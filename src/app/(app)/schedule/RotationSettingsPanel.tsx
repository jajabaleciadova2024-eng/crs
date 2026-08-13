"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill, Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import type { AppRole, TenureGroup } from "@/lib/database.types";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  role: AppRole;
  is_immune: boolean;
  tenure_group: TenureGroup;
};

const ROLE_LABEL: Record<AppRole, string> = { team_leader: "Team Leader", oic: "OIC", associate: "Associate" };

function RotationRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [isImmune, setIsImmune] = useState(member.is_immune);
  const [tenureGroup, setTenureGroup] = useState<TenureGroup>(member.tenure_group);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("profiles").update({ is_immune: isImmune, tenure_group: tenureGroup }).eq("id", member.id);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <tr>
      <td className="py-2.5 border-b border-[var(--line)]">{formatFullName(member.first_name, member.last_name)}</td>
      <td className="py-2.5 border-b border-[var(--line)]">
        <Pill tone={member.role === "associate" ? "accent" : "warn"}>{ROLE_LABEL[member.role]}</Pill>
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {editing ? (
          <input type="checkbox" checked={isImmune} onChange={(e) => setIsImmune(e.target.checked)} className="w-4 h-4 cursor-pointer" />
        ) : member.is_immune ? (
          <Pill tone="accent">Immune</Pill>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {member.role !== "associate" ? (
          <span className="text-[var(--muted)]">—</span>
        ) : editing ? (
          <select
            value={tenureGroup}
            onChange={(e) => setTenureGroup(e.target.value as TenureGroup)}
            className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
          >
            <option value="new_hire">New Hire</option>
            <option value="tenured">Tenured</option>
          </select>
        ) : (
          <Pill tone={member.tenure_group === "tenured" ? "good" : "muted"}>
            {member.tenure_group === "tenured" ? "Tenured" : "New Hire"}
          </Pill>
        )}
      </td>
      <td className="py-2.5 border-b border-[var(--line)]">
        {editing ? (
          <div className="flex gap-1.5">
            <Button variant="primary" style={{ padding: "5px 10px" }} disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button style={{ padding: "5px 10px" }} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button style={{ padding: "5px 10px" }} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </td>
    </tr>
  );
}

// Team-Leader-only. Immune and Tenure used to be edited from Team & Roles,
// which made that table noisy with columns that only matter for schedule
// generation — moved here since that's the only place they're actually
// used (Immune placement + Tenured/New-Hire quotas in the Generate modal).
export default function RotationSettingsPanel({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-[var(--muted)] m-0">No OIC or associate members yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Name</th>
            <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Role</th>
            <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Immune</th>
            <th className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold py-2.5 border-b border-[var(--line)]">Tenure</th>
            <th className="py-2.5 border-b border-[var(--line)]" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <RotationRow key={m.id} member={m} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
