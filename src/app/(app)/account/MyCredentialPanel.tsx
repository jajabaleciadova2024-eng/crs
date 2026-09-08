"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Pill } from "@/components/ui";
import PasswordCountdown from "@/components/PasswordCountdown";
import { expiryState, expiryFrom, BLOCK_WITHIN_DAYS, PASSWORD_VALID_DAYS } from "@/lib/passwordExpiry";
import ProofViewer from "@/components/ProofViewer";
import ProofExample from "./ProofExample";
import CredentialProofRow from "./CredentialProofRow";
import GuideSample from "./GuideSample";
import { shrinkOneForUpload, readUploadError, NETWORK_ERROR_MESSAGE } from "@/lib/imageUpload";

type Reset = { id: string; resetAt: string; status: string; reviewNote: string | null; hasProof: boolean };

function banner(state: string, isTL: boolean): { text: string; tone: "good" | "warn" | "bad" } {
  switch (state) {
    case "ok":
      return { text: "Your password is in good standing.", tone: "good" };
    case "warning":
      return { text: "Your password expires soon — reset it before it bites.", tone: "warn" };
    case "blocking":
      return {
        text: isTL
          ? `Inside the final ${BLOCK_WITHIN_DAYS} days — reset it on the platform and confirm your own report.`
          : `Inside the final ${BLOCK_WITHIN_DAYS} days: your upcoming schedule and leave filing are locked until this is reset and confirmed.`,
        tone: "bad",
      };
    case "expired":
      return { text: "Your password has expired. Reset it on the platform now.", tone: "bad" };
    default:
      return {
        text: isTL
          ? "No reset on record yet — set your own baseline in the table below."
          : "No reset on record yet — ask your Team Leader to set your baseline.",
        tone: "bad",
      };
  }
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold shrink-0 ${
        done
          ? "bg-[var(--good-soft)] text-[var(--good)]"
          : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      }`}
    >
      {done ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

export default function MyCredentialPanel({
  lastResetAt,
  mfaProof,
  mfaVerified,
  mfaNote,
  passkeyProof,
  passkeyVerified,
  passkeyNote,
  pending,
  history,
  isTeamLeader,
}: {
  lastResetAt: string | null;
  mfaProof: boolean;
  mfaVerified: boolean;
  mfaNote: string | null;
  passkeyProof: boolean;
  passkeyVerified: boolean;
  passkeyNote: string | null;
  pending: { id: string; resetAt: string } | null;
  history: Reset[];
  isTeamLeader: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resetDate, setResetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const fileRef = useRef<HTMLInputElement>(null);

  const state = expiryState(lastResetAt);
  const note = banner(state, isTeamLeader);
  const expiry = expiryFrom(lastResetAt);
  const lastRejected = !pending && history[0]?.status === "rejected" ? history[0] : null;

  const blockers = isTeamLeader
    ? []
    : ([
        !mfaProof
          ? "Upload your MFA screenshot"
          : !mfaVerified
            ? "Your MFA screenshot is waiting on the Team Leader to verify it"
            : null,
      ].filter(Boolean) as string[]);

  function choose(f: File) {
    if (preview) URL.revokeObjectURL(preview);
    setProof(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  async function submit() {
    if (!isTeamLeader && !mfaVerified) {
      setError(
        mfaProof
          ? "Your MFA screenshot is still waiting on the Team Leader to verify it."
          : "Upload your MFA screenshot first — it must be verified before you can report a reset.",
      );
      return;
    }
    if (!proof && !isTeamLeader) {
      setError("Attach a screenshot of Security info › Password › Last updated.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    if (proof) {
      const { file: ready, error: tooBig } = await shrinkOneForUpload(proof);
      if (tooBig) {
        setError(tooBig);
        setBusy(false);
        return;
      }
      fd.append("proof", ready);
    }
    fd.append("reset_at", new Date(`${resetDate}T00:00:00`).toISOString());
    let res: Response;
    try {
      res = await fetch("/api/account/reset", { method: "POST", body: fd });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR_MESSAGE);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(await readUploadError(res, "Couldn't submit."));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setProof(null);
    setPreview(null);
    router.refresh();
  }

  return (
    <Panel title="My account" hint={`Password expires ${PASSWORD_VALID_DAYS} days after each reset`}>
      <div className="flex flex-col gap-4">
        {/* Countdown */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
              Time until expiry
            </div>
            <PasswordCountdown lastResetAt={lastResetAt} variant="segments" />
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">
              Expires on
            </div>
            <div className="text-[14px] font-semibold text-[var(--ink)]">
              {expiry
                ? expiry.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                : "No reset on record"}
            </div>
          </div>
        </div>

        <div
          className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{
            background:
              note.tone === "good" ? "var(--good-soft)" : note.tone === "warn" ? "var(--warn-soft)" : "var(--bad-soft)",
            color:
              note.tone === "good" ? "var(--good)" : note.tone === "warn" ? "var(--warn)" : "var(--bad)",
          }}
        >
          {note.text}
        </div>

        {lastRejected && (
          <div className="rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] px-3 py-2.5">
            <div className="text-[11px] font-bold text-[var(--bad)] uppercase tracking-wider">
              Your last report was rejected
            </div>
            {lastRejected.reviewNote && (
              <p className="text-[12.5px] text-[var(--ink)] m-0 mt-1 leading-snug">{lastRejected.reviewNote}</p>
            )}
            <p className="text-[11.5px] text-[var(--muted)] m-0 mt-1">
              Fix what&apos;s noted above and report it again below.
            </p>
          </div>
        )}

        {/* ── 3-Step guide ─────────────────────────────────────────── */}
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold border-t border-[var(--line)] pt-3.5">
          Complete these steps in order
        </div>

        {/* Step 1: MFA */}
        <div className="flex gap-3">
          <StepNumber n={1} done={mfaVerified} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--ink)]">
              Upload MFA screenshot {!isTeamLeader && <span className="text-[var(--bad)]">(required)</span>}
            </div>
            <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5 leading-snug">
              Go to your account&apos;s Security info page and screenshot the section showing MFA is enabled.
            </p>
            <div className="mt-2">
              <CredentialProofRow
                kind="mfa"
                label="MFA"
                priority=""
                required={!isTeamLeader}
                emptyLabel="Not uploaded"
                hasProof={mfaProof}
                verified={mfaVerified}
                reviewNote={mfaNote}
              />
            </div>
            <GuideSample step="mfa" isTeamLeader={isTeamLeader} />
          </div>
        </div>

        {/* Step 2: Passkey */}
        <div className="flex gap-3 border-t border-[var(--line)] pt-4">
          <StepNumber n={2} done={passkeyVerified} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--ink)]">
              Upload Passkey screenshot <span className="text-[var(--muted)]">(recommended)</span>
            </div>
            <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5 leading-snug">
              If you have a passkey set up, screenshot the section showing it&apos;s configured.
            </p>
            <div className="mt-2">
              <CredentialProofRow
                kind="passkey"
                label="Passkey"
                priority=""
                required={false}
                emptyLabel={isTeamLeader ? "Not uploaded" : "Recommended"}
                hasProof={passkeyProof}
                verified={passkeyVerified}
                reviewNote={passkeyNote}
              />
            </div>
            <GuideSample step="passkey" isTeamLeader={isTeamLeader} />
          </div>
        </div>

        {/* Step 3: Password reset */}
        <div className="flex gap-3 border-t border-[var(--line)] pt-4">
          <StepNumber n={3} done={!!pending || state === "ok"} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--ink)]">
              Report password reset <span className="text-[var(--muted)]">(required)</span>
            </div>
            <p className="text-[11px] text-[var(--muted)] m-0 mt-0.5 leading-snug">
              {isTeamLeader
                ? "Reset your password on the platform, then report it here. Your own reports are auto-confirmed."
                : "Reset your password on the platform, then report it here with a screenshot. Your Team Leader will confirm it."}
            </p>
            {!isTeamLeader && (
              <p className="text-[10.5px] text-[var(--muted)] m-0 mt-1 leading-snug italic">
                To submit: Step 1 (MFA screenshot) must be uploaded and verified by your Team Leader, and you must attach a screenshot of your password reset.
              </p>
            )}

            {pending ? (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] mt-2">
                <Pill tone="warn">{isTeamLeader ? "Awaiting your confirmation" : "Awaiting TL confirmation"}</Pill>
                <span className="text-[var(--muted)]">
                  Reported on{" "}
                  {new Date(pending.resetAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) choose(f);
                  }}
                />

                <div>
                  <label
                    htmlFor="reset-date"
                    className="block text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1"
                  >
                    Date you reset it
                  </label>
                  <input
                    id="reset-date"
                    type="date"
                    value={resetDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setResetDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[12.5px] text-[var(--ink)]"
                  />
                  <span className="block text-[10.5px] text-[var(--muted)] mt-1">Must match the screenshot</span>
                </div>

                <div>
                  {proof ? (
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview ?? ""}
                        alt=""
                        className="w-12 h-12 rounded object-cover border border-[var(--line)] shrink-0"
                      />
                      <span className="text-[12.5px] text-[var(--ink)] truncate flex-1 min-w-0">{proof.name}</span>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="text-[11.5px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer shrink-0"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (preview) URL.revokeObjectURL(preview);
                          setProof(null);
                          setPreview(null);
                        }}
                        className="text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center gap-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/20 transition-colors cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17V5" />
                          <path d="m6 11 6-6 6 6" />
                          <path d="M4 19h16" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-[var(--ink)]">
                          Upload screenshot{isTeamLeader ? " (optional)" : ""}
                        </span>
                        <span className="block text-[11px] text-[var(--muted)] leading-snug">
                          From Security info › Password › Last updated
                        </span>
                      </span>
                    </button>
                  )}

                  <ProofExample />
                  <GuideSample step="reset" isTeamLeader={isTeamLeader} />
                </div>

                {blockers.length > 0 && (
                  <ul className="flex flex-col gap-0.5 m-0 pl-4 text-[11.5px] text-[var(--muted)]">
                    {blockers.map((b) => (
                      <li key={b} className="list-disc">{b}</li>
                    ))}
                  </ul>
                )}

                <div>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || (!isTeamLeader && (!proof || !mfaVerified))}
                    title={blockers.length > 0 ? blockers.join(" · ") : undefined}
                    className="px-3.5 py-2 rounded-md text-[12.5px] font-bold bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {busy ? "Submitting…" : "Password Reset Complete"}
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-[12px] text-[var(--bad)] mt-2 mb-0">{error}</p>
            )}
          </div>
        </div>

        {/* Reset history */}
        {history.length > 0 && (
          <div className="border-t border-[var(--line)] pt-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
              My reset history
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="hidden sm:grid sm:grid-cols-[110px_120px_1fr_auto] gap-x-3 pb-1 border-b border-[var(--line)]">
                {["Reset on", "Status", isTeamLeader ? "Review note" : "Team Leader's note", ""].map((h, i) => (
                  <span key={h || i} className="text-[9.5px] uppercase tracking-wider text-[var(--muted)] font-semibold">{h}</span>
                ))}
              </div>
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[12px] border-b border-[var(--line)] last:border-b-0 sm:grid sm:grid-cols-[110px_120px_1fr_auto]"
                >
                  <span className="min-w-[92px] sm:min-w-0 text-[var(--ink)] whitespace-nowrap">
                    {new Date(h.resetAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  <span className="sm:justify-self-start">
                    <Pill tone={h.status === "approved" ? "good" : h.status === "rejected" ? "bad" : "warn"}>
                      {h.status === "approved" ? "Confirmed" : h.status === "rejected" ? "Rejected" : "Pending"}
                    </Pill>
                  </span>
                  <span className="w-full sm:w-auto order-last sm:order-none text-[var(--muted)] min-w-0 break-words">
                    {h.reviewNote ?? "—"}
                  </span>
                  <span className="ml-auto sm:ml-0 sm:justify-self-end">
                    {h.hasProof ? (
                      <ProofViewer fetchUrl={`/api/account/proof/${h.id}`} title="Your password reset proof" />
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
