"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Pill } from "@/components/ui";
import PasswordCountdown from "@/components/PasswordCountdown";
import { expiryState, expiryFrom, daysRemaining, PASSWORD_VALID_DAYS, BLOCK_WITHIN_DAYS } from "@/lib/passwordExpiry";
import ProofViewer from "@/components/ProofViewer";
import ProofVerify from "./ProofVerify";

export type OversightRow = {
  profileId: string;
  name: string;
  role: string;
  lastResetAt: string | null;
  mfa: boolean;
  mfaVerified: boolean;
  passkey: boolean;
  passkeyVerified: boolean;
  pendingResetId: string | null;
  pendingResetAt: string | null;
  pendingHasProof: boolean;
  // Most recent reset carrying a screenshot, so a confirmed one stays
  // reviewable rather than vanishing the moment it is confirmed.
  lastProofResetId: string | null;
  lastProofStatus: string | null;
};

const STATE_PILL: Record<string, { label: string; tone: "good" | "warn" | "bad" | "muted" }> = {
  ok: { label: "Healthy", tone: "good" },
  warning: { label: "Expiring soon", tone: "warn" },
  blocking: { label: "Blocking", tone: "bad" },
  expired: { label: "Expired", tone: "bad" },
  unset: { label: "No baseline", tone: "muted" },
};

// Team Leader only — the page never renders this for anyone else, and the
// member-facing variant it used to support is gone deliberately: credential
// state is not a shared board.
// "3 Sep 2026" — short enough to sit inside a table cell, unambiguous
// about the month, which a numeric date is not across devices.
function shortDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

export default function CredentialOversight({
  rows,
  viewerId,
}: {
  rows: OversightRow[];
  // The Team Leader's own row is a record, not a demand: nothing on this
  // page asks anything of them, so their proofs read neutrally rather than
  // as a red "Missing".
  viewerId: string;
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
    // A claim waiting on you comes first regardless of expiry: it is the
    // only row where you are the blocker rather than the member.
    if (!!a.pendingResetId !== !!b.pendingResetId) return a.pendingResetId ? -1 : 1;
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
      <table className="w-full text-[13px] border-collapse min-w-[760px]">
        <thead>
          <tr>
            {["Member", "Status", "Time left", "Expires", "Reset proof", "MFA", "Passkey", "Action"].map((h, i) => (
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
              <tr
                key={r.profileId}
                className={r.pendingResetId ? "bg-[var(--warn-soft)]/25" : undefined}
              >
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">{r.name}</td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  {r.pendingResetId ? (
                    // A claim outranks the expiry state here. The countdown
                    // beside it is still the OLD one and stays that way until
                    // confirmation — this pill is what says so.
                    <Pill tone="warn">Awaiting your confirmation</Pill>
                  ) : (
                    <Pill tone={STATE_PILL[st].tone}>{STATE_PILL[st].label}</Pill>
                  )}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  <PasswordCountdown lastResetAt={r.lastResetAt} size="sm" />
                  {r.pendingResetId && (
                    // The date the MEMBER reported, and the expiry it buys
                    // them. Confirming dates the cycle from their reset, not
                    // from this click, so this is the number being agreed to
                    // — showing only "restarts on confirm" left the Team
                    // Leader approving a date they could not see.
                    <div className="text-[10px] text-[var(--warn)] font-semibold mt-0.5 leading-tight">
                      {r.pendingResetAt
                        ? `restarts from ${shortDate(r.pendingResetAt)} \u2192 expires ${shortDate(expiryFrom(r.pendingResetAt)?.toISOString() ?? null)}`
                        : "restarts on confirm"}
                    </div>
                  )}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] text-[var(--muted)] whitespace-nowrap">
                  {exp ? exp.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  {r.lastProofResetId ? (
                    rejecting === `proof-${r.lastProofResetId}` ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          autoFocus
                          placeholder="What's wrong?"
                          className="min-h-[30px] px-2 py-1 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-[11.5px] w-[140px]"
                        />
                        <button
                          type="button"
                          disabled={!note.trim() || busy === r.lastProofResetId}
                          onClick={() => review(r.lastProofResetId!, "rejected", note.trim())}
                          className="inline-flex items-center justify-center min-h-[30px] px-2.5 py-1 rounded-md text-[11.5px] font-bold border bg-[var(--bad)] border-[var(--bad)] text-[var(--on-accent)] hover:bg-[var(--bad-strong)] hover:border-[var(--bad-strong)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejecting(null)}
                          className="inline-flex items-center justify-center min-h-[30px] px-2.5 py-1 rounded-md text-[11.5px] font-bold border bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {r.lastProofStatus === "pending" ? (
                          <span title="Unconfirmed">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          </span>
                        ) : (
                          <span title="Confirmed">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                        <ProofViewer
                          fetchUrl={`/api/account/proof/${r.lastProofResetId}`}
                          title="Password reset proof"
                          subtitle={r.name}
                        />
                        <button
                          type="button"
                          onClick={() => { setRejecting(`proof-${r.lastProofResetId}`); setNote(""); }}
                          title="Reject — member re-uploads"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-mdtext-[var(--muted)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)] transition-colors cursor-pointer"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    )
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  <ProofVerify
                    kind="mfa"
                    profileId={r.profileId}
                    memberName={r.name}
                    hasProof={r.mfa}
                    verified={r.mfaVerified}
                    required={r.profileId !== viewerId}
                  />
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  <ProofVerify
                    kind="passkey"
                    profileId={r.profileId}
                    memberName={r.name}
                    hasProof={r.passkey}
                    verified={r.passkeyVerified}
                    required={false}
                  />
                </td>
                <td className="px-2 sm:px-3 py-2.5 border-b border-[var(--line)] whitespace-nowrap">
                  {r.pendingResetId ? (
                    rejecting === r.pendingResetId ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          autoFocus
                          placeholder="What's wrong?"
                          className="min-h-[30px] px-2 py-1 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-[11.5px] w-[140px]"
                        />
                        <button
                          type="button"
                          disabled={!note.trim() || busy === r.pendingResetId}
                          onClick={() => review(r.pendingResetId!, "rejected", note.trim())}
                          className="inline-flex items-center justify-center min-h-[30px] px-2.5 py-1 rounded-md text-[11.5px] font-bold border bg-[var(--bad)] border-[var(--bad)] text-[var(--on-accent)] hover:bg-[var(--bad-strong)] hover:border-[var(--bad-strong)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejecting(null)}
                          className="inline-flex items-center justify-center min-h-[30px] px-2.5 py-1 rounded-md text-[11.5px] font-bold border bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[10.5px] text-[var(--ink)]" title={r.pendingResetAt ? `Reset ${shortDate(r.pendingResetAt)}` : "Pending"}>
                          {r.pendingResetAt ? shortDate(r.pendingResetAt) : "Pending"}
                        </span>
                        {r.pendingHasProof && (
                          <ProofViewer
                            fetchUrl={`/api/account/proof/${r.pendingResetId}`}
                            title="Password reset proof"
                            subtitle={r.name}
                          />
                        )}
                        <button
                          type="button"
                          disabled={busy === r.pendingResetId || !r.mfaVerified}
                          onClick={() => review(r.pendingResetId!, "approved")}
                          title={
                            r.mfaVerified
                              ? `Confirm and restart their ${PASSWORD_VALID_DAYS} days`
                              : r.mfa
                                ? "Verify their MFA screenshot first"
                                : "No MFA screenshot — they must upload first"
                          }
                          className="inline-flex items-center justify-center w-7 h-7 rounded-mdbg-[var(--good)] text-[var(--on-accent)] hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejecting(r.pendingResetId); setNote(""); }}
                          title="Reject — member re-uploads"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-mdtext-[var(--muted)] hover:bg-[var(--bad-soft)] hover:text-[var(--bad)] transition-colors cursor-pointer"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    )
                  ) : baselineFor === r.profileId ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="date"
                        value={baselineDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setBaselineDate(e.target.value)}
                        className="min-h-[30px] px-2 py-1 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-[11.5px]"
                      />
                      <button
                        type="button"
                        disabled={!baselineDate || busy === r.profileId}
                        onClick={() => saveBaseline(r.profileId)}
                        title="Save baseline"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-mdbg-[var(--accent)] text-[var(--on-accent)] cursor-pointer disabled:opacity-40"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBaselineFor(null)}
                        title="Cancel"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-mdtext-[var(--muted)] hover:bg-[var(--paper-raised)] transition-colors cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Panel
      title="Everyone's expiry"
      hint={awaiting > 0 ? `${awaiting} awaiting your confirmation · ${atRisk} at risk` : `${atRisk} at risk`}
      footnote={`Proof of a reset is a screenshot of the platform's Security info \u203a Password \u203a Last updated — check its date against the one the member entered before confirming. Confirming restarts that member's ${PASSWORD_VALID_DAYS} days from the date they reported, not from when you confirmed it. A reset cannot be confirmed until you have VERIFIED that member's MFA screenshot — uploading one is not enough, and replacing a verified screenshot sends it back for checking. A missing or unverified passkey is flagged but never blocks. A member is blocked from ${BLOCK_WITHIN_DAYS} days before expiry — day ${PASSWORD_VALID_DAYS - BLOCK_WITHIN_DAYS} of the cycle. Members with no baseline are treated as blocking until you set one.`}
    >
      {error && (
        <p role="alert" className="text-[12.5px] text-[var(--bad)] mb-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--muted)] mb-3">
        <span className="inline-flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          Verified / Confirm
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          Needs check
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--bad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          Missing
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          Reject
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[var(--muted)] leading-none">—</span>
          Not required
        </span>
      </div>
      {table}
    </Panel>
  );
}
