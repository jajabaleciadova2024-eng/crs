"use client";

import { useEffect, useState } from "react";
import { formatFullName } from "@/lib/format";
import Linkify from "@/components/Linkify";

type UnseenAnnouncement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
  image_urls?: string[];
};

// Pops the newest announcement the member has not finished being shown,
// on the first visit after each login. It runs for three logins rather than
// one: a single showing is easy to click past on the way to the schedule,
// which is how announcements get missed.
//
// The showing is recorded when the modal APPEARS, not when it is dismissed.
// Closing the tab without clicking "Got it" still counts — otherwise the
// same notice would greet the member forever.
export default function UnseenAnnouncementModal() {
  const [announcement, setAnnouncement] = useState<UnseenAnnouncement | null>(null);
  const [showing, setShowing] = useState<{ n: number; total: number } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/announcements/unseen", { cache: "no-store" });
        if (!res.ok) return;
        const { announcement: ann, showing: n, totalShowings } = await res.json();
        if (ann && !cancelled) {
          setAnnouncement(ann);
          setShowing({ n, total: totalShowings });
          setShow(true);
          // Count it now, while it is on screen.
          fetch("/api/announcements/seen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ announcement_id: ann.id }),
          }).catch(() => {});
        }
      } catch {
        // Silently ignore — not critical
      }
    }
    // Small delay so the page finishes rendering before the modal pops
    const timer = setTimeout(check, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  function dismiss() {
    setShow(false);
  }

  if (!show || !announcement) return null;

  const authorName = announcement.profiles
    ? formatFullName(announcement.profiles.first_name, announcement.profiles.last_name)
    : "Team Leader";

  return (
    <div
      // items-start + my-auto, not items-center: a centred flex child that
      // overflows its scroll container puts its own top ABOVE the scrollable
      // area, so the header was clipped with no way to scroll up to it. On a
      // phone in landscape 12px of this modal's top was unreachable.
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto px-4 py-4 z-[60] animate-fade-in"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-lg my-auto bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-scale-in"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header banner */}
        <div className="bg-[var(--accent)] px-6 py-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[20px]">📢</span>
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">New Announcement</span>
          </div>
          <h2 className="text-[20px] font-serif font-bold m-0 leading-tight">{announcement.title}</h2>
          <p className="text-[12px] opacity-75 m-0 mt-1">
            Posted by {authorName} · {new Date(announcement.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          <p className="text-[14px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap break-words m-0">
            <Linkify text={announcement.body} />
          </p>

          {(announcement.image_urls?.length ?? 0) > 0 && (
            <div
              className={`mt-3 grid gap-2 ${
                announcement.image_urls!.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {announcement.image_urls!.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={`Attachment ${i + 1}`}
                  className="w-full rounded-lg border border-[var(--line)] object-cover"
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--line)] flex items-center justify-between gap-3">
          {/* Says plainly that this is the same notice coming round again,
              not a new one, and when it will stop. */}
          <span className="text-[11.5px] text-[var(--muted)]">
            {showing && showing.n >= showing.total
              ? "Last reminder"
              : showing
                ? `Reminder ${showing.n} of ${showing.total}`
                : ""}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] transition-colors shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
