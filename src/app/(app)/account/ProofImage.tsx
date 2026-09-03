"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// Viewer for an MFA / passkey screenshot. Same shape as ProofLink (which
// handles reset proofs) — fetched on click because the URL is short-lived,
// and shown in-page because window.open after an await gets popup-blocked.
export default function ProofImage({
  kind,
  profileId,
  label = "View",
}: {
  kind: "mfa" | "passkey";
  profileId?: string;
  label?: string;
}) {
  const [view, setView] = useState<
    { s: "closed" } | { s: "loading" } | { s: "ready"; url: string } | { s: "error"; m: string }
  >({ s: "closed" });

  async function open() {
    setView({ s: "loading" });
    try {
      const qs = new URLSearchParams({ kind, ...(profileId ? { profile_id: profileId } : {}) });
      const res = await fetch(`/api/account/credential-proof?${qs}`);
      if (!res.ok) {
        setView({ s: "error", m: (await res.json().catch(() => ({}))).error ?? "Couldn't open it." });
        return;
      }
      const { url } = await res.json();
      setView({ s: "ready", url });
    } catch {
      setView({ s: "error", m: "Couldn't reach the server." });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
      >
        {label}
      </button>
      {view.s !== "closed" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setView({ s: "closed" })}
          >
            {view.s === "loading" && <span className="text-white text-[13px]">Opening…</span>}
            {view.s === "error" && (
              <div
                className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl px-4 py-3 max-w-sm cursor-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[13px] text-[var(--bad)] m-0 font-semibold">{view.m}</p>
              </div>
            )}
            {view.s === "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.url}
                alt={`${kind} proof`}
                className="max-w-full max-h-full rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              type="button"
              onClick={() => setView({ s: "closed" })}
              aria-label="Close"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-[20px] cursor-pointer"
            >
              ×
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
