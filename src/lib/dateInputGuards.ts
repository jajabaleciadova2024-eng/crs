import type { KeyboardEvent, ClipboardEvent, WheelEvent } from "react";

// Forces a native <input type="date"> to be picker-only — no typing digits
// in by hand. Spread `datePickerOnlyProps` onto the input alongside its
// normal value/onChange. Tab/Shift+Tab still work for keyboard navigation
// between fields; every other key (including the segment arrow keys the
// browser itself provides inside the field) is suppressed, and paste/
// scroll-to-change are blocked too.
function blockKeyboardEntry(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Tab") return;
  e.preventDefault();
}

function blockPaste(e: ClipboardEvent<HTMLInputElement>) {
  e.preventDefault();
}

// Chrome/Edge let a focused date input's value scroll-wheel-increment —
// blocked too so the only way to change it is the calendar picker.
function blockWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export const datePickerOnlyProps = {
  onKeyDown: blockKeyboardEntry,
  onPaste: blockPaste,
  onWheel: blockWheel,
};
