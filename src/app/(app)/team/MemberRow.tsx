"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill, Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import type { AppRole, Profile } from "@/lib/database.types";

const ROLE_TONE: Record<AppRole, "warn" | "accent"> = {
  team_leader: "warn",
  oic: "warn",
  associate: "accent",
};
const ROLE_LABEL: Record<AppRole, string> = { team_leader: "Team Leader", oic: "OIC", associate: "Associate" };

function IconButton({
  label,
  onClick,
  disabled,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        tone === "danger"
          ? "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--bad)] hover:bg-[var(--bad-soft)] hover:border-[var(--bad)]"
          : "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
      }`}
    >
      {children}
    </button>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const INPUT_CLS =
  "mt-1 w-full text-[13px] border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-colors";

export default function MemberRow({ member, isSelf }: { member: Profile; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [psid, setPsid] = useState(member.psid);
  const [firstName, setFirstName] = useState(member.first_name);
  const [middleName, setMiddleName] = useState(member.middle_name ?? "");
  const [lastName, setLastName] = useState(member.last_name);
  const [email, setEmail] = useState(member.email);
  const [mobile, setMobile] = useState(member.mobile_number ?? "");
  const [role, setRole] = useState(member.role);

  const [resetSent, setResetSent] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function startEdit() {
    setPsid(member.psid);
    setFirstName(member.first_name);
    setMiddleName(member.middle_name ?? "");
    setLastName(member.last_name);
    setEmail(member.email);
    setMobile(member.mobile_number ?? "");
    setRole(member.role);
    setSaveError(null);
    setEditing(true);
  }

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          psid: psid.trim(),
          first_name: firstName.trim(),
          middle_name: middleName.trim() || null,
          last_name: lastName.trim(),
          email: email.trim(),
          mobile_number: mobile.trim() || null,
          role,
        })
        .eq("id", member.id);
      if (error) {
        setSaveError(error.message);
        return;
      }
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
          <Pill tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</Pill>
        </td>
        <td className="py-2.5 border-b border-[var(--line)]">
          <div className="flex gap-1.5">
            <IconButton label="Edit" onClick={startEdit}>
              <Icon>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </Icon>
            </IconButton>
            <IconButton
              label={resetSent ? "Reset link sent" : "Reset password"}
              onClick={sendReset}
              disabled={pending || resetSent}
            >
              {resetSent ? (
                <Icon><path d="M20 6 9 17l-5-5" /></Icon>
              ) : (
                <Icon>
                  <circle cx="7.5" cy="15.5" r="4.5" />
                  <path d="M10.6 12.4 19 4l2 2-2 2 2 2-3 3-2-2-3.4 3.4" />
                </Icon>
              )}
            </IconButton>
            {!isSelf && (
              <>
                <IconButton
                  label={member.is_active ? "Deactivate" : "Reactivate"}
                  onClick={toggleActive}
                  disabled={pending}
                >
                  <Icon>
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </Icon>
                </IconButton>
                <IconButton
                  label="Remove"
                  tone="danger"
                  disabled={pending}
                  onClick={() => { setRemoveError(null); setConfirmingRemove(true); }}
                >
                  <Icon>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </Icon>
                </IconButton>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* ── Edit modal ──────────────────────────────────────────────── */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in"
          onClick={() => { setEditing(false); setSaveError(null); }}
        >
          <div
            className="w-full max-w-lg bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl p-6 flex flex-col gap-4 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">
              Edit {formatFullName(member.first_name, member.last_name)}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">PSID</span>
                <input type="text" value={psid} onChange={(e) => setPsid(e.target.value)} className={INPUT_CLS} required />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">First name</span>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT_CLS} required autoFocus />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Middle name</span>
                <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={INPUT_CLS} placeholder="Optional" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Last name</span>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT_CLS} required />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLS} required />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Mobile</span>
                <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className={INPUT_CLS} placeholder="Optional" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={INPUT_CLS}>
                  <option value="associate">Associate</option>
                  <option value="oic">OIC</option>
                  <option value="team_leader">Team Leader</option>
                </select>
              </label>
            </div>

            {saveError && (
              <p className="text-[12px] text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{saveError}</p>
            )}

            <div className="flex justify-end gap-2 mt-1">
              <Button
                style={{ padding: "7px 14px" }}
                disabled={pending}
                onClick={() => { setEditing(false); setSaveError(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px" }}
                disabled={pending || !psid.trim() || !firstName.trim() || !lastName.trim() || !email.trim()}
                onClick={save}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirmation modal ───────────────────────────────── */}
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
