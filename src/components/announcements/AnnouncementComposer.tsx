"use client";

import { useState } from "react";

export default function AnnouncementComposer({
  onSubmit,
}: {
  onSubmit: (title: string, body: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    await onSubmit(title.trim(), body.trim());
    setTitle("");
    setBody("");
    setSubmitting(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl text-[14px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Post a new announcement…
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl p-6 flex flex-col gap-4 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">New Announcement</h2>
            <p className="text-[12.5px] text-[var(--muted)] m-0 -mt-2">
              This will notify all team members via bell &amp; email.
            </p>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Announcement title"
                autoFocus
                className="mt-1 w-full text-[14px] border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold">Description</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                rows={6}
                placeholder="Write your announcement details here…"
                className="mt-1 w-full resize-none text-[14px] border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--paper)] text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
              />
              <span className="text-[10.5px] text-[var(--muted)] mt-1 block text-right">
                {body.length}/5000
              </span>
            </label>

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="px-4 py-2 text-[12.5px] font-bold text-[var(--muted)] hover:text-[var(--ink)] rounded-lg hover:bg-[var(--paper)] border border-[var(--line)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!title.trim() || !body.trim() || submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {submitting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Publish
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
