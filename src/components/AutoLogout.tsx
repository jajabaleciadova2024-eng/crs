"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 12-hour auto-logout — ensures every user's session expires after 12
// hours so they re-authenticate and see any new announcements (the
// unseen-announcement modal fires on first visit after login).
//
// Timer resets on any user interaction (mouse, keyboard, touch) so the
// 12 hours count from last activity, not from login. If the tab is left
// idle for 12 hours the user is signed out and redirected to /login.
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export default function AutoLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function logout() {
      const supabase = createClient();
      supabase.auth.signOut().then(() => {
        router.push("/login");
        router.refresh();
      });
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, TWELVE_HOURS_MS);
    }

    // Reset on any user activity
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer(); // start the timer

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [router]);

  return null; // Invisible — no UI, just the timer
}
