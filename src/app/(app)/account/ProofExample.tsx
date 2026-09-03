"use client";

import { useState } from "react";

// A mock of the platform's Security info page showing which row to capture.
//
// Deliberately a drawing, not a real screenshot: a genuine one carries a
// name, work email and mobile number, and this page is seen by the whole
// team. The values below are invented.
export default function ProofExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11.5px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
      >
        {open ? "Hide example" : "See what to screenshot"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--line)] bg-white p-3 overflow-x-auto">
          <div className="min-w-[300px] text-[#201f1e]" style={{ fontFamily: "system-ui, sans-serif" }}>
            <div className="text-[15px] font-semibold mb-0.5">Security info</div>
            <div className="text-[10.5px] text-[#605e5c] mb-2.5">
              These are the methods you use to sign into your account or reset your password.
            </div>

            <div className="border border-[#e1dfdd] rounded">
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#e1dfdd] text-[11px]">
                <span className="text-[#0078d4] font-semibold">+</span>
                <span className="text-[#0078d4]">Add sign-in method</span>
              </div>

              <div className="flex items-center px-2.5 py-1.5 border-b border-[#e1dfdd] text-[11px] text-[#605e5c]">
                <span className="w-[86px] text-[#201f1e]">Phone</span>
                <span className="flex-1">+63 9•• ••• ••••</span>
                <span className="text-[#0078d4]">Change</span>
              </div>

              {/* The row that matters. */}
              <div className="flex items-start px-2.5 py-2 border-b border-[#e1dfdd] text-[11px] rounded-sm ring-2 ring-[#d13438] bg-[#fdf3f4]">
                <span className="w-[86px] font-semibold text-[#201f1e]">Password</span>
                <span className="flex-1 leading-tight">
                  <span className="text-[#605e5c]">Last updated:</span>
                  <br />
                  <span className="font-semibold text-[#201f1e]">6 minutes ago</span>
                </span>
                <span className="text-[#0078d4]">Change</span>
              </div>

              <div className="flex items-center px-2.5 py-1.5 text-[11px] text-[#605e5c]">
                <span className="w-[86px] text-[#201f1e]">Security questions</span>
                <span className="flex-1">5 security questions added</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--muted)] m-0 mt-2 leading-snug">
            Capture the <span className="font-semibold text-[var(--ink)]">Password</span> row with its
            <span className="font-semibold text-[var(--ink)]"> Last updated</span> value. Hovering that value
            shows the full date and time — include it if you can.
          </p>
        </div>
      )}
    </div>
  );
}
