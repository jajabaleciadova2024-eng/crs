"use client";

import { useEffect, useState } from "react";
import { formatCountdown, expiryFrom, expiryState } from "@/lib/passwordExpiry";

// Live DD:HH:MM:SS to password expiry.
//
// The expiry instant is computed on the server and passed in as an ISO
// string; only the ticking happens here. Deriving it client-side from a
// duration would drift with the tab's clock and with however long the page
// sat open.
export default function PasswordCountdown({
  lastResetAt,
  size = "md",
}: {
  lastResetAt: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const expiry = expiryFrom(lastResetAt);
  const [now, setNow] = useState<number | null>(null);

  // Starts null and fills in after mount: rendering a clock during SSR
  // guarantees a hydration mismatch, since the server's "now" is always a
  // little older than the browser's.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const text = { sm: "text-[15px]", md: "text-[22px]", lg: "text-[30px]" }[size];

  if (!expiry) {
    return <span className={`${text} font-mono tabular-nums text-[var(--muted)]`}>--:--:--:--</span>;
  }

  const ms = now === null ? expiry.getTime() - Date.now() : expiry.getTime() - now;
  const state = expiryState(lastResetAt, now ?? Date.now());
  const color =
    state === "expired" || state === "blocking"
      ? "var(--bad)"
      : state === "warning"
        ? "var(--warn)"
        : "var(--good)";

  return (
    <span
      className={`${text} font-mono tabular-nums font-bold leading-none`}
      style={{ color }}
      // Keeps the value out of the a11y tree's constant-update churn while
      // still being readable on demand.
      suppressHydrationWarning
      title={`Expires ${expiry.toLocaleString()}`}
    >
      {formatCountdown(ms)}
    </span>
  );
}
