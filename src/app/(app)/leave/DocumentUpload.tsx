"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DocumentUpload({ requestId, documentUrl }: { requestId: string; documentUrl: string | null }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/leave/${requestId}/document`, { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed.");
      return;
    }

    router.refresh();
  }

  if (documentUrl) {
    return (
      <a href={documentUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[var(--accent-strong)]">
        View document
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <input ref={inputRef} type="file" onChange={handleFile} disabled={uploading} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs font-bold text-[var(--accent-strong)] disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload document"}
      </button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}
