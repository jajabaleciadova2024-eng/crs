"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { shrinkOneForUpload, readUploadError, NETWORK_ERROR_MESSAGE } from "@/lib/imageUpload";

export default function GuideSample({
  step,
  isTeamLeader,
}: {
  step: "mfa" | "passkey" | "reset";
  isTeamLeader: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/account/guide-sample?step=${step}`);
      if (res.ok) {
        const data = await res.json();
        setUrl(data.url);
      } else {
        setUrl(null);
      }
    } catch {
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [step]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const { file: ready, error: tooBig } = await shrinkOneForUpload(file);
    if (tooBig) { setError(tooBig); setBusy(false); return; }
    const fd = new FormData();
    fd.append("step", step);
    fd.append("file", ready);
    try {
      const res = await fetch("/api/account/guide-sample", { method: "POST", body: fd });
      if (!res.ok) { setError(await readUploadError(res, "Couldn't upload.")); setBusy(false); return; }
    } catch {
      setError(NETWORK_ERROR_MESSAGE); setBusy(false); return;
    }
    setBusy(false);
    load();
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    await fetch(`/api/account/guide-sample?step=${step}`, { method: "DELETE" });
    setBusy(false);
    setUrl(null);
    router.refresh();
  }

  if (loading) return null;

  // No sample and not TL — nothing to show
  if (!url && !isTeamLeader) return null;

  return (
    <div className="mt-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />

      {url ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer"
          >
            {open ? "Hide sample" : "📷 View sample from TL"}
          </button>
          {open && (
            <div className="mt-1.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-2 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Sample screenshot"
                className="w-full max-h-[300px] object-contain rounded"
              />
              {isTeamLeader && (
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : isTeamLeader ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline cursor-pointer disabled:opacity-50"
        >
          {busy ? "Uploading…" : "📷 Upload a sample for members"}
        </button>
      ) : null}

      {error && <span className="block text-[11px] text-[var(--bad)] mt-0.5">{error}</span>}
    </div>
  );
}
