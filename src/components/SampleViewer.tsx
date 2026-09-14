"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// Modal viewer for sample photos whose signed URLs are already available
// client-side. Unlike ProofViewer (which fetches URLs on open), this one
// takes them as props — no round-trip, no loading state.

export default function SampleViewer({
  urls,
  title,
  initialIndex = 0,
  children,
}: {
  /** Already-signed URLs for the sample photos. */
  urls: string[];
  /** Task title, shown in the modal header. */
  title: string;
  /** Which image to start on when the modal opens. */
  initialIndex?: number;
  /** The clickable trigger element. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(initialIndex);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + urls.length) % urls.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % urls.length);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close, urls.length]);

  if (urls.length === 0) return null;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => { setIndex(initialIndex); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIndex(initialIndex); setOpen(true); } }}
        className="cursor-pointer"
      >
        {children}
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
            onClick={close}
          >
            <div
              className="w-full max-w-3xl max-h-[92vh] my-auto flex flex-col bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-scale-in"
              style={{ boxShadow: "var(--shadow-lg)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] shrink-0">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--ink)] truncate">{title}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    Sample photo{urls.length > 1 ? ` · ${index + 1} of ${urls.length}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {urls.length > 1 && (
                    <>
                      <button
                        type="button"
                        title="Previous"
                        aria-label="Previous"
                        onClick={() => setIndex((i) => (i - 1 + urls.length) % urls.length)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Next"
                        aria-label="Next"
                        onClick={() => setIndex((i) => (i + 1) % urls.length)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    title="Close"
                    aria-label="Close"
                    onClick={close}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)] transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center p-3 bg-[var(--paper)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={urls[index]}
                  src={urls[index]}
                  alt={`Sample photo ${index + 1} for ${title}`}
                  className="max-w-full object-contain rounded"
                  style={{ maxHeight: "calc(92vh - 84px)" }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
