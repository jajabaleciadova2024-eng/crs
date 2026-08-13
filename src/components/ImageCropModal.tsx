"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Square crop viewport shown to the user, in CSS pixels.
const VIEW = 280;
// Output image resolution — square, generous enough for the largest
// avatar size used anywhere in the app (the 80px dashboard frame) while
// staying small in bytes.
const OUT = 512;

export default function ImageCropModal({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Legitimate "synchronize with an external system" effect (creating an
    // object URL for the picked File), not a state cascade.
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Effective bounding-box size after rotation (90°/270° swap width/height
  // for the axis-aligned viewport, even though the image itself is what
  // rotates) — needed for both the cover-scale and the pan clamp below.
  const effSize = useMemo(() => {
    if (!naturalSize) return null;
    const swapped = rotation % 180 !== 0;
    return { w: swapped ? naturalSize.h : naturalSize.w, h: swapped ? naturalSize.w : naturalSize.h };
  }, [naturalSize, rotation]);

  const baseScale = effSize ? Math.max(VIEW / effSize.w, VIEW / effSize.h) : 1;
  const scale = baseScale * zoom;

  function clampPan(x: number, y: number, currentScale: number) {
    if (!effSize) return { x: 0, y: 0 };
    const scaledW = effSize.w * currentScale;
    const scaledH = effSize.h * currentScale;
    const maxX = Math.max((scaledW - VIEW) / 2, 0);
    const maxY = Math.max((scaledH - VIEW) / 2, 0);
    return { x: Math.min(Math.max(x, -maxX), maxX), y: Math.min(Math.max(y, -maxY), maxY) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setPan({ x: 0, y: 0 });
  }

  function startDrag(clientX: number, clientY: number) {
    dragRef.current = { startX: clientX, startY: clientY, panX: pan.x, panY: pan.y };
  }
  function moveDrag(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setPan(clampPan(dragRef.current.panX + dx, dragRef.current.panY + dy, scale));
  }
  function endDrag() {
    dragRef.current = null;
  }

  function rotate() {
    setRotation((r) => (r + 90) % 360);
    setPan({ x: 0, y: 0 });
  }

  function handleZoom(next: number) {
    setZoom(next);
    setPan((p) => clampPan(p.x, p.y, baseScale * next));
  }

  function save() {
    if (!imgRef.current || !naturalSize) return;
    setSaving(true);

    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }

    const outScale = OUT / VIEW;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.translate(OUT / 2, OUT / 2);
    ctx.translate(pan.x * outScale, pan.y * outScale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * outScale, scale * outScale);
    ctx.drawImage(imgRef.current, -naturalSize.w / 2, -naturalSize.h / 2);

    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onSave(blob);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 z-[60] animate-fade-in" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-5 flex flex-col gap-3 animate-scale-in"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-lg text-[var(--ink)] m-0">Adjust photo</h2>

        <div
          className="relative mx-auto rounded-full overflow-hidden border-2 border-[var(--accent)] bg-[var(--paper)] cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ width: VIEW, height: VIEW }}
          onMouseDown={(e) => {
            e.preventDefault();
            startDrag(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => {
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            moveDrag(t.clientX, t.clientY);
          }}
          onTouchEnd={endDrag}
        >
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- object URL, transformed on a canvas for the real upload
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              draggable={false}
              onLoad={handleImgLoad}
              className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
              style={{
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={rotate}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-strong)] hover:underline px-2 py-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            Rotate 90°
          </button>
        </div>

        <p className="text-[11px] text-[var(--muted)] text-center m-0">Drag to reposition, use the slider to zoom.</p>

        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-md text-[12.5px] font-bold border bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !imgUrl}
            className="px-3.5 py-1.5 rounded-md text-[12.5px] font-bold border bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
