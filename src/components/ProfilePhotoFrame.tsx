"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ImageCropModal from "./ImageCropModal";

export default function ProfilePhotoFrame({
  firstName,
  lastName,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setError(null);
    // Opens the crop/rotate/zoom editor instead of uploading immediately —
    // the file only gets sent to the server once the user confirms.
    setPendingFile(file);
  }

  async function handleCropped(blob: Blob) {
    setPendingFile(null);
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", blob, "avatar.jpg");
    const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed.");
      return;
    }

    router.refresh();
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    setUploading(true);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove your photo.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] transition-transform duration-150 hover:scale-[1.02] active:scale-100"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <div
          className="w-[84px] h-[84px] rounded-full overflow-hidden border-[3px] border-[var(--paper-raised)] transition-shadow duration-200"
          style={{ boxShadow: "0 0 0 2px var(--accent), var(--shadow-md)" }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`${firstName}'s photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[var(--accent-soft)] to-[var(--accent-soft)]/60 text-[var(--accent-strong)] flex items-center justify-center text-[28px] font-bold font-serif">
              {initials}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="text-white text-[10px] font-bold tracking-wide uppercase">
            {uploading ? "Working…" : "Change"}
          </span>
        </div>
      </button>
      {avatarUrl && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] underline-offset-2 hover:underline"
        >
          Remove photo
        </button>
      )}
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}

      {pendingFile && (
        <ImageCropModal file={pendingFile} onCancel={() => setPendingFile(null)} onSave={handleCropped} />
      )}
    </div>
  );
}
