"use client";

import { useEffect, useState } from "react";
import { formatFullName } from "@/lib/format";

type UnseenAnnouncement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
};

// Shown once per unseen announcement on first visit after login.
// Fetches the latest unseen announcement and displays it in a modal;
// dismissing marks it as seen so it won't show again.
export default function UnseenAnnouncementModal() {
  const [announcement, setAnnouncement] = useState<UnseenAnnouncement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/announcements/unseen", { cache: "no-store" });
        if (!res.ok) return;
        const { announcement: ann } = await res.json();
        if (ann && !cancelled) {
          setAnnouncement(ann);
          setShow(true);
        }
      } catch {
        // Silently ignore — not critical
      }
    }
    // Small delay so the page finishes rendering before the modal pops
    const timer = setTimeout(check, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  async function dismiss() {
    if (!announcement) return;
    setShow(false);
    // Mark as seen in the background — don't block the UI
    fetch("/api/announcements/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: announcement.id }),
    }).catch(() => {});
  }

  if (!show || !announcement) return null;

  const authorName = announcement.profiles
    ? formatFullName(announcement.profiles.first_name, announcement.profiles.last_name)
    : "Team Leader";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 z-[60] animate-fade-in"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-lg bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl overflow-hidden animate-scale-in"
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
            {announcement.body}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--line)] flex justify-end">
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
