"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Pill } from "@/components/ui";
import PasswordCountdown from "@/components/PasswordCountdown";
import { expiryState, expiryFrom, daysRemaining } from "@/lib/passwordExpiry";
import ProofLink from "./ProofLink";

export type OversightRow = {
  profileId: string;
  name: string;
  role: string;
  lastResetAt: string | null;
  mfa: boolean;
  passkey: boolean;
  pendingResetId: string | null;
  pendingResetAt: string | null;
  pendingHasProof: boolean;
};

const STATE_PILL: Record<string, { label: string; tone: "good" | "warn" | "bad" | "muted" }> = {
  ok: { label: "Healthy", tone: "good" },
  warning: { label: "Expiring soon", tone: "warn" },
  blocking: { label: "Blocking", tone: "bad" },
  expired: { label: "Expired", tone: "bad" },
  unset: { label: "No baseline", tone: "muted" },
};

export default function CredentialOversight({
  rows,
  readOnly = false,
}: {
  rows: OversightRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [baselineFor, setBaselineFor] = useState<string | null>(null);
  const [baselineDate, setBaselineDate] = useState("");

  // Worst first: the whole point is that the person about to lapse is the
  // first name you see, not buried alphabetically.
  const RANK: Record<string, number> = { expired: 0, unset: 1, blocking: 2, warning: 3, ok: 4 };
  const sorted = [...rows].sort((a, b) => {
    const ra = RANK[expiryState(a.lastResetAt)], rb = RANK[expiryState(b.lastResetAt)];
    if (ra !== rb) return ra - rb;
    const da = daysRemaining(a.lastResetAt) ?? -1, db = daysRemaining(b.lastResetAt) ?? -1;
    return da - db;
  });

  async function review(resetId: string, status: "approved" | "rejected", reviewNote?: string) {
    setBusy(resetId);
    setError(null);
    const res = await fetch("/api/account/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset_id: resetId, status, review_note: reviewNote ?? null }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    setRejecting(null);
    setNote("");
    router.refresh();
  }

  async function saveBaseline(profileId: string) {
    if (!baselineDate) return;
    setBusy(profileId);
    setError(null);
    const res = await fetch("/api/account/baseline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, last_reset_at: new Date(`${baselineDate}T00:00:00`).toISOString() }),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    setBaselineFor(null);
    setBaselineDate("");
    router.refresh();
  }

  const atRisk = rows.filter((r) => ["expired", "unset", "blocking"].includes(expiryState(r.lastResetAt))).length;
  const awaiting = rows.filter((r) => r.pendingResetId).length;

  const table = (
    <div className="overflow-x-auto scroll-shadow-x">
      <table className="w-full text-[13px] border-collapse min-w-[640px]">
        <thead>
          <tr>
            {["Member", "Status", "Time left", "Expires", "MFA", "Passkey", readOnly ? "" : "Action"].map((h, i) => (
              <th
                key={h || i}
                className="text-left text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const st = expiryState(r.lastResetAt);
            const exp = expiryFrom(r.lastResetAt);
            return (
              <tr key={r.profileId}>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">{r.name}</td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                  <Pill tone={STATE_PILL[st].tone}>{STATE_PILL[st].label}</Pill>
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  <PasswordCountdown lastResetAt={r.lastResetAt} size="sm" />
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                  {exp ? exp.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                  {r.mfa ? <span className="text-[var(--good)]">✓</span> : <Pill tone="bad">Missing</Pill>}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)]">
                  {r.passkey ? <span className="text-[var(--good)]">✓</span> : <Pill tone="bad">Missing</Pill>}
                </td>
                {!readOnly && (
                  <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                    {r.pendingResetId ? (
                      rejecting === r.pendingResetId ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            autoFocus
                            placeholder="Why reject?"
                            className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper)] text-[11.5px] w-[150px]"
                          />
                          <button
                            type="button"
                            disabled={!note.trim() || busy === r.pendingResetId}
                            onClick={() => review(r.pendingResetId!, "rejected", note.trim())}
                            className="px-2 py-1 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white cursor-pointer disabled:opacity-40"
                          >
                            Confirm reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejecting(null)}
                            className="text-[10.5px] font-bold text-[var(--muted)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Pill tone="warn">Claimed</Pill>
                          {r.pendingHasProof && <ProofLink resetId={r.pendingResetId} />}
                          <button
                            type="button"
                            disabled={busy === r.pendingResetId}
                            onClick={() => review(r.pendingResetId!, "approved")}
                            className="px-2 py-1 rounded text-[10.5px] font-bold bg-[var(--good)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejecting(r.pendingResetId); setNote(""); }}
                            className="px-2 py-1 rounded text-[10.5px] font-bold bg-[var(--bad)] text-white hover:opacity-90 cursor-pointer"
                          >
                            Reject
                          </button>
                        </span>
                      )
                    ) : baselineFor === r.profileId ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={baselineDate}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setBaselineDate(e.target.value)}
                          className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper)] text-[11.5px]"
                        />
                        <button
                          type="button"
                          disabled={!baselineDate || busy === r.profileId}
                          onClick={() => saveBaseline(r.profileId)}
                          className="px-2 py-1 rounded text-[10.5px] font-bold bg-[var(--accent)] text-white cursor-pointer disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setBaselineFor(null)}
                          className="text-[10.5px] font-bold text-[var(--muted)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setBaselineFor(r.profileId); setBaselineDate(""); }}
                        className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
                      >
                        {r.lastResetAt ? "Correct date" : "Set baseline"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (readOnly) return table;

  return (
    <Panel
      title="Everyone's expiry"
      hint={`${atRisk} at risk · ${awaiting} awaiting confirmation`}
      footnote="Confirming a reset restarts that member's 60 days from the date they reported, not from when you confirmed it. Members with no baseline are treated as blocking until you set one."
    >
      {error && (
        <p role="alert" className="text-[12.5px] text-[var(--bad)] mb-2">
          {error}
        </p>
      )}
      {table}
    </Panel>
  );
}
