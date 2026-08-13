"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DocumentUpload({ requestId, hasDocument }: { requestId: string; hasDocument: boolean }) {
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

  if (hasDocument) {
    return <DocumentLinks requestId={requestId} />;
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <input ref={inputRef} type="file" onChange={handleFile} disabled={uploading} className="hidden" />
      <Button
        type="button"
        variant="primary"
        style={{ padding: "5px 10px" }}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Uploading…" : "Upload"}
      </Button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}

// Shared by the uploader's own row and the Team Leader's view of anyone
// else's — fetches a fresh short-lived signed link on each click rather
// than storing one (they expire).
export function DocumentLinks({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(kind: "view" | "download") {
    setError(null);
    setLoading(kind);
    const res = await fetch(`/api/leave/${requestId}/document`);
    const body = await res.json().catch(() => ({}));
    setLoading(null);

    if (!res.ok) {
      setError(body.error ?? "Couldn't open the document.");
      return;
    }

    window.open(kind === "view" ? body.viewUrl : body.downloadUrl, "_blank", "noreferrer");
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex gap-2">
        <button type="button" onClick={() => open("view")} disabled={loading !== null} className="text-xs font-bold text-[var(--accent-strong)] disabled:opacity-50">
          {loading === "view" ? "Opening…" : "View"}
        </button>
        <button type="button" onClick={() => open("download")} disabled={loading !== null} className="text-xs font-bold text-[var(--accent-strong)] disabled:opacity-50">
          {loading === "download" ? "Opening…" : "Download"}
        </button>
      </div>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}
