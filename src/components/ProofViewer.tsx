"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// One viewer for every uploaded proof in the app — task photos, password
// reset screenshots, MFA and passkey captures.
//
// There were three near-identical copies before, each with its own trigger
// and its own modal, so the same action looked different depending on which
// page you were on. This is the single one: an icon trigger in a table cell,
// and a framed modal that names what you are looking at.
//
// Deliberately NOT window.open: the signed URL has to be fetched first, and
// calling window.open after an await loses the user-gesture context, so
// popup blockers swallow it silently.

export type ProofItem = { viewUrl: string; downloadUrl?: string; fileName?: string };

type ViewState =
  | { s: "closed" }
  | { s: "loading" }
  | { s: "ready"; items: ProofItem[]; index: number }
  | { s: "error"; m: string };

function IconBtn({
  onClick,
  href,
  download,
  title,
  children,
}: {
  onClick?: () => void;
  href?: string;
  download?: string;
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer";
  return href ? (
    <a href={href} download={download} title={title} aria-label={title} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={cls}>
      {children}
    </button>
  );
}

export default function ProofViewer({
  fetchUrl,
  title,
  subtitle,
  canDownload = false,
  count = 0,
}: {
  /** Endpoint returning `{ photos: [...] }`, or `{ viewUrl, downloadUrl }`, or `{ url }`. */
  fetchUrl: string;
  /** What this is proof OF — the task, or the kind of screenshot. */
  title: string;
  /** Whose it is. */
  subtitle?: string;
  canDownload?: boolean;
  /** Shown on the trigger when there is more than one image. */
  count?: number;
}) {
  const [view, setView] = useState<ViewState>({ s: "closed" });

  async function open() {
    setView({ s: "loading" });
    try {
      const res = await fetch(fetchUrl);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setView({ s: "error", m: body.error ?? "Couldn't open it." });
        return;
      }
      // Three response shapes across the routes this serves; normalise here
      // rather than making each caller know which one it gets.
      const items: ProofItem[] = body.photos?.length
        ? body.photos
        : [{ viewUrl: body.viewUrl ?? body.url, downloadUrl: body.downloadUrl, fileName: body.fileName }];
      if (!items[0]?.viewUrl) {
        setView({ s: "error", m: "That file couldn't be opened." });
        return;
      }
      setView({ s: "ready", items, index: 0 });
    } catch {
      setView({ s: "error", m: "Couldn't reach the server." });
    }
  }

  const current = view.s === "ready" ? view.items[view.index] : null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={`View proof — ${title}`}
        aria-label={`View proof — ${title}`}
        className="inline-flex items-center gap-1 justify-center h-7 px-1.5 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--accent-strong)] transition-colors cursor-pointer hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {/* The only text on the trigger, and only when it says something the
            icon cannot: that there is more than one image behind it. */}
        {count > 1 && <span className="text-[10.5px] font-bold tabular-nums">{count}</span>}
      </button>

      {view.s !== "closed" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
            onClick={() => setView({ s: "closed" })}
          >
            <div
              className="w-full max-w-3xl max-h-[92vh] my-auto flex flex-col bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-scale-in"
              style={{ boxShadow: "var(--shadow-lg)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] shrink-0">
                {/* What you are looking at. Reviewing a proof means checking
                    it against the task it claims to be for and the person who
                    sent it — "Proof of completion" alone told you neither. */}
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ink)] truncate">{title}</div>
                  {(subtitle || (view.s === "ready" && view.items.length > 1)) && (
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      {subtitle}
                      {subtitle && view.s === "ready" && view.items.length > 1 ? " · " : ""}
                      {view.s === "ready" && view.items.length > 1
                        ? `${view.index + 1} of ${view.items.length}`
                        : ""}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {view.s === "ready" && view.items.length > 1 && (
                    <>
                      <IconBtn
                        title="Previous"
                        onClick={() =>
                          setView((v) =>
                            v.s === "ready"
                              ? { ...v, index: (v.index - 1 + v.items.length) % v.items.length }
                              : v,
                          )
                        }
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </IconBtn>
                      <IconBtn
                        title="Next"
                        onClick={() =>
                          setView((v) =>
                            v.s === "ready" ? { ...v, index: (v.index + 1) % v.items.length } : v,
                          )
                        }
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </IconBtn>
                    </>
                  )}
                  {canDownload && current?.downloadUrl && (
                    <IconBtn title="Download" href={current.downloadUrl} download={current.fileName}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <path d="M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </IconBtn>
                  )}
                  <IconBtn title="Close" onClick={() => setView({ s: "closed" })}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </IconBtn>
                </div>
              </div>

              {/* Capped against the VIEWPORT: max-height:100% only resolves
                  against a parent with a definite height, and this one is
                  auto, so a tall photo would burst out of the frame. */}
              <div className="flex-1 min-h-0 flex items-center justify-center p-3 bg-[var(--paper)]">
                {view.s === "loading" && (
                  <span className="py-10 text-[13px] text-[var(--muted)]">Opening…</span>
                )}
                {view.s === "error" && (
                  <p className="py-10 text-[13px] text-[var(--bad)] m-0 font-semibold text-center px-4">
                    {view.m}
                  </p>
                )}
                {current && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={current.viewUrl}
                    src={current.viewUrl}
                    alt={`${title}${subtitle ? ` — ${subtitle}` : ""}`}
                    className="max-w-full object-contain rounded"
                    style={{ maxHeight: "calc(92vh - 84px)" }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
