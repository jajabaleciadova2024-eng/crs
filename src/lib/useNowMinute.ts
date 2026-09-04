"use client";

import { useSyncExternalStore } from "react";

// A clock that ticks once a minute, shared by every component that reads it.
//
// The obvious version — useState(0) plus an effect that immediately calls
// setNowMs(Date.now()) — is a cascading render on mount, and reading
// Date.now() during render is impure; React's lint rules reject both, and
// they are right to. useSyncExternalStore is the sanctioned shape: the
// snapshot is a cached value, not a fresh reading, so it is stable across
// renders, and the server snapshot is 0 so nothing can mismatch on hydration.
//
// One interval for the whole page rather than one per component, started
// with the first subscriber and cleared with the last.

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    // First read happens here, after mount — never during render.
    tick();
    timer = setInterval(tick, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Epoch milliseconds, refreshed each minute. 0 until mounted. */
export function useNowMinute(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
