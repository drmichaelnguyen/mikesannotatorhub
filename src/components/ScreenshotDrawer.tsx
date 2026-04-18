"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Props = {
  lang: Lang;
  imageDataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
};

export function ScreenshotDrawer({ lang, imageDataUrl, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const tk = (k: DictKey) => t(lang, k);

  const syncSize = useCallback(() => {
    const img = imgRef.current;
    const c = drawRef.current;
    if (!img || !c) return;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (!w || !h) return;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
    }
  }, []);

  useEffect(() => {
    if (!open || !imageDataUrl) return;
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => syncSize();
    if (img.complete) onLoad();
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [open, imageDataUrl, syncSize]);

  useEffect(() => {
    if (!open) return;
    const ro = new ResizeObserver(() => syncSize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [open, syncSize]);

  function mergeToPng(): string | null {
    const img = imgRef.current;
    const d = drawRef.current;
    if (!img || !d || !imageDataUrl) return null;
    const out = document.createElement("canvas");
    out.width = img.naturalWidth;
    out.height = img.naturalHeight;
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.drawImage(img, 0, 0);
    if (d.width && d.height) {
      octx.drawImage(d, 0, 0, img.naturalWidth, img.naturalHeight);
    }
    return out.toDataURL("image/png");
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = drawRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = drawRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    setDrawing(true);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const c = drawRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !c) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = drawRef.current;
    if (c?.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    setDrawing(false);
  }

  function clearPen() {
    const c = drawRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
  }

  if (!imageDataUrl) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
      >
        {tk("open_draw")}
      </button>
      {open && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-sm text-[var(--muted)]">{tk("draw_hint")}</p>
          <div ref={wrapRef} className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageDataUrl}
              alt="screenshot"
              className="block max-h-[360px] max-w-full object-contain"
            />
            <canvas
              ref={drawRef}
              className="pointer-events-auto absolute left-0 top-0 touch-none"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearPen}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              {tk("draw_clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                const merged = mergeToPng();
                onChange(merged);
                setOpen(false);
              }}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)]"
            >
              {tk("draw_save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
