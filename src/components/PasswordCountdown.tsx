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
  // "segments" gives each unit its own tile with the label underneath, so
  // the reading is self-describing. "compact" carries the units inline
  // (68d 07h 17m 02s) for a stat card, where a separate DD:HH:MM:SS legend
  // was an extra line no other card had. The inline form needed a separate
  // "DD : HH : MM : SS" legend line, which sat under the number looking
  // like a stray caption and had to be mentally lined up with it.
  variant = "inline",
}: {
  lastResetAt: string | null;
  size?: "sm" | "md" | "lg";
  variant?: "inline" | "segments" | "compact";
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
    if (variant === "compact") {
      return <span className="font-mono tabular-nums text-[var(--muted)] text-[20px] leading-none">--d --h --m</span>;
    }
    if (variant === "segments") {
      return (
        <div className="flex items-start gap-1.5">
          {["Days", "Hrs", "Min", "Sec"].map((u) => (
            <Segment key={u} value="--" unit={u} color="var(--muted)" />
          ))}
        </div>
      );
    }
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

  if (variant === "compact") {
    const [dd, hh, mm, ss] = formatCountdown(ms).split(":");
    return (
      <span
        className="font-mono tabular-nums font-bold text-[22px] sm:text-[24px] leading-none whitespace-nowrap tracking-tight"
        style={{ color }}
        suppressHydrationWarning
        title={`Expires ${expiry.toLocaleString()}`}
      >
        {dd}
        <span className="text-[13px] font-semibold opacity-60">d </span>
        {hh}
        <span className="text-[13px] font-semibold opacity-60">h </span>
        {mm}
        <span className="text-[13px] font-semibold opacity-60">m </span>
        {ss}
        <span className="text-[13px] font-semibold opacity-60">s</span>
      </span>
    );
  }

  if (variant === "segments") {
    const [dd, hh, mm, ss] = formatCountdown(ms).split(":");
    return (
      <div className="flex items-start gap-1.5" title={`Expires ${expiry.toLocaleString()}`}>
        <Segment value={dd} unit="Days" color={color} />
        <Segment value={hh} unit="Hrs" color={color} />
        <Segment value={mm} unit="Min" color={color} />
        <Segment value={ss} unit="Sec" color={color} />
      </div>
    );
  }

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

// One unit of the countdown: the number, and what it counts.
function Segment({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-mono tabular-nums font-bold text-[24px] sm:text-[28px] leading-none px-2 py-1.5 rounded-lg bg-[var(--paper)] border border-[var(--line)] min-w-[46px] sm:min-w-[52px] text-center"
        style={{ color }}
        suppressHydrationWarning
      >
        {value}
      </span>
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--muted)] font-semibold mt-1">{unit}</span>
    </div>
  );
}
