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
  const [resetSent, setResetSent] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
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

  function sendReset() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(member.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResetSent(true);
    });
  }

  function removeMember() {
    setRemoveError(null);
    startTransition(async () => {
      const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRemoveError(body.error ?? "Couldn't remove that member.");
        return;
      }
      setConfirmingRemove(false);
      router.refresh();
    });
  }

  // A confirm modal can't live inside the <tr> itself (a <tbody> may only
  // validly contain <tr> children) — React portals it out via a fixed
  // overlay instead, rendered as a sibling passed up through a Fragment.
  // Same fixed inset-0 overlay pattern as ClearScheduleButton.
  return (
    <>
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
            <div className="flex flex-wrap gap-1.5">
              <Button style={{ padding: "5px 10px" }} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button style={{ padding: "5px 10px" }} disabled={pending || resetSent} onClick={sendReset}>
                {resetSent ? "Reset link sent" : "Reset password"}
              </Button>
              {!isSelf && (
                <>
                  <Button style={{ padding: "5px 10px" }} disabled={pending} onClick={toggleActive}>
                    {member.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                  <Button
                    style={{ padding: "5px 10px", color: "var(--bad)" }}
                    disabled={pending}
                    onClick={() => {
                      setRemoveError(null);
                      setConfirmingRemove(true);
                    }}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          )}
        </td>
      </tr>

      {confirmingRemove && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in"
          onClick={() => setConfirmingRemove(false)}
        >
          <div
            className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-6 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">Remove {formatFullName(member.first_name, member.last_name)}?</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              This permanently deletes their account and login — they won&apos;t be able to sign in again, and this
              can&apos;t be undone. Their past schedule assignments and leave requests are removed with them. If you
              just want to disable their access without losing their history, use <strong className="text-[var(--ink)]">Deactivate</strong> instead.
            </p>

            {removeError && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{removeError}</p>}

            <div className="flex justify-end gap-2 mt-1">
              <Button style={{ padding: "7px 14px" }} disabled={pending} onClick={() => setConfirmingRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px", background: "var(--bad-strong)", borderColor: "var(--bad-strong)" }}
                disabled={pending}
                onClick={removeMember}
              >
                {pending ? "Removing…" : "Yes, remove them"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
