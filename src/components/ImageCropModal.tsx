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
  const [imgReady, setImgReady] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    // Legitimate "synchronize with an external system" effect (creating an
    // object URL for the picked File), not a state cascade.
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
    setImgReady(true);
  }

  // Pointer Events (not separate mouse/touch handlers) + pointer capture:
  // once captured, this element keeps receiving move/up events for that
  // pointer even after the cursor leaves its bounds mid-drag — which a
  // plain onMouseMove/onMouseUp pair on the small crop circle doesn't,
  // and dragging past a 280px circle is trivially easy to do. That gap
  // was the "something off" feeling — drag tracking would just silently
  // stop and the photo would appear stuck until the pointer re-entered
  // the circle. Facebook's own crop UI (and every other drag-to-pan
  // implementation) relies on exactly this capture behavior.
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(clampPan(dragRef.current.panX + dx, dragRef.current.panY + dy, scale));
  }
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    handleZoom(Math.min(3, Math.max(1, zoom - e.deltaY * 0.0015)));
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center px-4 py-6 z-[60] animate-fade-in overflow-y-auto" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-scale-in my-auto"
        style={{ boxShadow: "var(--shadow-xl)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-serif text-xl text-[var(--ink)] m-0 leading-tight">Adjust photo</h2>
          <p className="text-[12px] text-[var(--muted)] m-0 mt-0.5">Drag to reposition. Scroll or use the slider to zoom.</p>
        </div>

        <div className="relative mx-auto" style={{ width: VIEW, height: VIEW }}>
          {/* Dimmed square backdrop behind the circular crop, like
              Facebook's uploader — gives context for how the square
              source image maps onto the round result instead of just
              showing a plain void around the circle. */}
          <div className="absolute inset-0 rounded-lg bg-black/5 dark:bg-white/5" />
          <div
            className={`absolute inset-0 rounded-full overflow-hidden bg-[var(--paper)] select-none touch-none ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            style={{ boxShadow: "0 0 0 2px var(--accent), 0 0 0 6px color-mix(in srgb, var(--accent) 20%, transparent)" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- object URL, transformed on a canvas for the real upload
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                draggable={false}
                onLoad={handleImgLoad}
                className="absolute top-1/2 left-1/2 max-w-none pointer-events-none transition-opacity duration-150"
                style={{
                  opacity: imgReady ? 1 : 0,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
                }}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="10" cy="10" r="6" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="10" cy="10" r="7" />
            <path d="m21 21-4.35-4.35M10 7v6M7 10h6" />
          </svg>
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

        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 min-h-[38px] px-3.5 py-2 rounded-lg text-[13px] font-bold border bg-[var(--paper-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !imgUrl}
            className="flex-1 min-h-[38px] px-3.5 py-2 rounded-lg text-[13px] font-bold border bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-50 shadow-sm hover:shadow"
          >
            {saving ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
