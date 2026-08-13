"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function DocumentUpload({
  requestId,
  hasDocument,
  canDownload,
}: {
  requestId: string;
  hasDocument: boolean;
  canDownload: boolean;
}) {
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
    return <DocumentLinks requestId={requestId} canDownload={canDownload} />;
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

// Shared by the uploader's own row and anyone with view access to someone
// else's. Only ever shows a "View" button inline (e.g. in the Queue) —
// Download lives inside the popup, and only for the Team Leader
// (`canDownload`); everyone else viewing just sees the document, no
// download link, matching the same signed-link-per-click pattern as
// before (fetched fresh on open since links expire).
export function DocumentLinks({ requestId, canDownload }: { requestId: string; canDownload: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ viewUrl: string; downloadUrl: string } | null>(null);

  async function openModal() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/leave/${requestId}/document`);
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't open the document.");
      return;
    }

    setLinks({ viewUrl: body.viewUrl, downloadUrl: body.downloadUrl });
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <Button type="button" variant="primary" style={{ padding: "5px 10px" }} disabled={loading} onClick={openModal}>
        {loading ? "Opening…" : "View"}
      </Button>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}

      {links && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setLinks(null)}>
          <div
            className="w-full max-w-3xl h-[85vh] bg-[var(--paper-raised)] border border-[var(--line)] rounded-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] shrink-0">
              <h2 className="font-serif text-base text-[var(--ink)] m-0">Supporting document</h2>
              <div className="flex items-center gap-2">
                {canDownload && (
                  <Button variant="primary" style={{ padding: "5px 10px" }} onClick={() => window.open(links.downloadUrl, "_blank", "noreferrer")}>
                    Download
                  </Button>
                )}
                <Button style={{ padding: "5px 10px" }} onClick={() => setLinks(null)}>
                  Close
                </Button>
              </div>
            </div>
            <iframe src={links.viewUrl} title="Supporting document" className="flex-1 w-full border-0 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
