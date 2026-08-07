"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { Profile } from "@/lib/database.types";

export default function AccountForm({ profile }: { profile: Profile }) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [mobile, setMobile] = useState(profile.mobile_number ?? "");
  const [saving, setSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, mobile_number: mobile || null })
      .eq("id", profile.id);
    setSaving(false);
    setMessage(error ? "Couldn't save changes." : "Saved.");
    router.refresh();
  }

  async function sendReset() {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(profile.email);
    setResetSent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">First name</label>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Last name</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Mobile number</label>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Email</label>
        <input
          value={profile.email}
          disabled
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm opacity-60"
        />
      </div>
      <div>
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">PSID</label>
        <input
          value={profile.psid}
          disabled
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm opacity-60"
        />
      </div>
      <div className="col-span-2">
        <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Password</label>
        <Button type="button" onClick={sendReset} disabled={resetSent}>
          {resetSent ? "Reset link sent" : "Send password reset link"}
        </Button>
      </div>

      {message && <p className="col-span-2 text-sm text-[var(--muted)]">{message}</p>}

      <div className="col-span-2 flex justify-end mt-1">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
