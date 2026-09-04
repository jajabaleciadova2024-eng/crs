"use client";

import { useRef, useState } from "react";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export default function AnnouncementComposer({
  onSubmit,
}: {
  onSubmit: (title: string, body: string, images: File[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  type Picked = { file: File; url: string };
  const [images, setImages] = useState<Picked[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs are a manual resource, created WITH the file in the handler
  // that picked it. Deriving them in an effect meant a cascading render on
  // every pick, and they still had to be revoked by hand either way.

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    setImageError(null);
    const incoming = [...picked];
    const tooBig = incoming.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setImageError(`"${tooBig.name}" is too large (10MB max).`);
      return;
    }
    const notImage = incoming.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      setImageError("Only images can be attached.");
      return;
    }
    setImages((prev) => {
      // Adding, not replacing — picking a second time should extend the set
      // rather than throw away what was already chosen.
      const room = MAX_IMAGES - prev.length;
      if (incoming.length > room) {
        setImageError(`Up to ${MAX_IMAGES} images — the rest were left out.`);
      }
      const taken = incoming.slice(0, Math.max(0, room));
      return [...prev, ...taken.map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }

  function reset() {
    setTitle("");
    setBody("");
    setImages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
    setImageError(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    await onSubmit(title.trim(), body.trim(), images.map((p) => p.file));
    reset();
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center px-4 py-6 z-50 animate-fade-in overflow-y-auto"
          onClick={() => {
            if (submitting) return;
            reset();
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl p-6 flex flex-col gap-4 animate-scale-in my-auto"
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

            <div>
              {/* block, not inline: an inline label sat on the same line as
                  the button below it, unlike every other field here. */}
              <span className="block text-[11px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1.5">
                Images (optional)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  // Clear it, or picking the same file twice in a row is a
                  // no-op because the input's value never changed.
                  e.target.value = "";
                }}
              />

              {images.length > 0 && (
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {images.map((p, i) => (
                    <div key={p.url} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--line)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.file.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setImages((prev) => {
                            const gone = prev[i];
                            if (gone) URL.revokeObjectURL(gone.url);
                            return prev.filter((_, j) => j !== i);
                          })
                        }
                        disabled={submitting}
                        aria-label={`Remove ${p.file.name}`}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-[13px] leading-none flex items-center justify-center hover:bg-black cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || images.length >= MAX_IMAGES}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[var(--line)] text-[var(--accent-strong)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  images.length > 0 ? "mt-2" : ""
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                {images.length === 0 ? "Add images" : `Add more (${images.length}/${MAX_IMAGES})`}
              </button>

              {imageError && (
                <p role="alert" className="text-[11.5px] text-[var(--bad)] m-0 mt-1.5">
                  {imageError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
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
