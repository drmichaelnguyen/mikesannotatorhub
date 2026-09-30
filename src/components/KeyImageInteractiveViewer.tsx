"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDicomFilename } from "@/lib/key-image-path";
import { paintDicomOnCanvas, renderDicomToImageData } from "@/lib/dicom-render";
import {
  strokePathD,
  type KeyImageMark,
  type KeyImagePoint,
} from "@/lib/key-image-annotations";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const PEN_COLOR = "#ef4444";

type Tool = "pan" | "draw";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function HandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V12m0-2.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.5a6.5 6.5 0 0 1-5.2-2.6L5 14.5"
      />
    </svg>
  );
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232 18.768 8.768M4 20l4.5-1 9.8-9.8a2.5 2.5 0 0 0-3.5-3.5L5 15.5 4 20z"
      />
    </svg>
  );
}

function markPoints(m: KeyImageMark): KeyImagePoint[] {
  if (Array.isArray(m.points) && m.points.length > 0) return m.points;
  if (typeof m.x === "number" && typeof m.y === "number") return [{ x: m.x, y: m.y }];
  return [];
}

export function KeyImageInteractiveViewer({
  lang,
  caseDbId,
  filename,
  marks,
  currentUserId,
  canDeleteOthers,
  onMarksChange,
}: {
  lang: Lang;
  caseDbId: string;
  filename: string;
  marks: KeyImageMark[];
  currentUserId: string | null;
  canDeleteOthers: boolean;
  onMarksChange: (marks: KeyImageMark[]) => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>("pan");
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [liveStroke, setLiveStroke] = useState<KeyImagePoint[]>([]);
  const liveStrokeRef = useRef<KeyImagePoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const imageSrc = `/api/cases/${caseDbId}/key-images/${encodeURIComponent(filename)}`;
  const fileMarks = useMemo(
    () => marks.filter((m) => m.filename === filename),
    [marks, filename],
  );

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setLiveStroke([]);
    liveStrokeRef.current = [];
    setSelectedId(null);
    setActionError(null);
    setTool("pan");
    setDrawing(false);
  }, [filename]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setLoadError(null);
    setDisplaySrc(null);

    const isDicom = isDicomFilename(filename);
    if (!isDicom) {
      setDisplaySrc(imageSrc);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    fetch(imageSrc, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (cancelled) return;
        const result = renderDicomToImageData(buffer);
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        const canvas = document.createElement("canvas");
        paintDicomOnCanvas(canvas, result.imageData);
        objectUrl = await new Promise<string>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("blob"));
                return;
              }
              resolve(URL.createObjectURL(blob));
            },
            "image/png",
          );
        });
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadError(tk("case_key_images_load_error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, filename, lang]);

  const applyZoomAt = useCallback((nextScale: number, cursorX: number, cursorY: number) => {
    const prev = scaleRef.current;
    const next = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (Math.abs(next - prev) < 0.001) return;
    const ratio = next / prev;
    const p = panRef.current;
    const nextPan =
      next <= 1.01
        ? { x: 0, y: 0 }
        : {
            x: cursorX - (cursorX - p.x) * ratio,
            y: cursorY - (cursorY - p.y) * ratio,
          };
    scaleRef.current = next <= 1.01 ? 1 : next;
    panRef.current = nextPan;
    setScale(scaleRef.current);
    setPan(nextPan);
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;
      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoomAt(scaleRef.current * zoomFactor, cursorX, cursorY);
    },
    [applyZoomAt],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, true);
  }, [onWheel, displaySrc, loading]);

  function setScaleFromSlider(raw: number) {
    const next = clamp(raw, MIN_SCALE, MAX_SCALE);
    applyZoomAt(next, 0, 0);
    if (next <= 1.01) {
      setPan({ x: 0, y: 0 });
      panRef.current = { x: 0, y: 0 };
    }
  }

  function clientToNormalized(clientX: number, clientY: number): KeyImagePoint | null {
    const wrap = imageWrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  async function saveStroke(points: KeyImagePoint[]) {
    if (points.length < 2) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/key-images/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          points,
          note: "",
          color: PEN_COLOR,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; marks?: KeyImageMark[] };
      if (!res.ok || !data.ok || !data.marks) {
        setActionError(tk("case_key_image_mark_save_error"));
        return;
      }
      onMarksChange(data.marks);
    } catch {
      setActionError(tk("case_key_image_mark_save_error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeMark(markId: string) {
    const previous = marks;
    onMarksChange(marks.filter((m) => m.id !== markId));
    if (selectedId === markId) setSelectedId(null);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/cases/${caseDbId}/key-images/annotations?id=${encodeURIComponent(markId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; marks?: KeyImageMark[] };
      if (!res.ok || !data.ok || !data.marks) {
        onMarksChange(previous);
        setActionError(tk("case_key_image_mark_save_error"));
        return;
      }
      onMarksChange(data.marks);
    } catch {
      onMarksChange(previous);
      setActionError(tk("case_key_image_mark_save_error"));
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (tool === "pan") {
      e.preventDefault();
      viewport.setPointerCapture(e.pointerId);
      setDragging(true);
      dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    // Draw mode — capture on the image wrap / viewport.
    const pt = clientToNormalized(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    setDrawing(true);
    setSelectedId(null);
    liveStrokeRef.current = [pt];
    setLiveStroke([pt]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (tool === "pan") {
      if (!dragging || !dragOrigin.current) return;
      const next = {
        x: dragOrigin.current.panX + (e.clientX - dragOrigin.current.x),
        y: dragOrigin.current.panY + (e.clientY - dragOrigin.current.y),
      };
      panRef.current = next;
      setPan(next);
      return;
    }

    if (!drawing) return;
    const pt = clientToNormalized(e.clientX, e.clientY);
    if (!pt) return;
    const prev = liveStrokeRef.current;
    const last = prev[prev.length - 1];
    // Skip tiny moves to keep strokes light.
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.002) return;
    const next = [...prev, pt];
    liveStrokeRef.current = next;
    setLiveStroke(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }

    if (tool === "pan") {
      setDragging(false);
      dragOrigin.current = null;
      return;
    }

    if (!drawing) return;
    setDrawing(false);
    const points = liveStrokeRef.current;
    liveStrokeRef.current = [];
    setLiveStroke([]);
    if (points.length >= 2) {
      void saveStroke(points);
    }
  }

  const livePath = strokePathD(liveStroke);

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-w-0 flex-1 gap-2">
        <div className="flex shrink-0 flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1.5">
          <button
            type="button"
            title={tk("case_key_image_tool_hand")}
            aria-label={tk("case_key_image_tool_hand")}
            aria-pressed={tool === "pan"}
            onClick={() => setTool("pan")}
            className={`flex h-10 w-10 items-center justify-center rounded-md ${
              tool === "pan"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            <HandIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            title={tk("case_key_image_tool_pen")}
            aria-label={tk("case_key_image_tool_pen")}
            aria-pressed={tool === "draw"}
            onClick={() => setTool("draw")}
            className={`flex h-10 w-10 items-center justify-center rounded-md ${
              tool === "draw"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            <PenIcon className="h-5 w-5" />
          </button>
          <div className="mx-auto h-px w-6 bg-[var(--border)]" />
          <button
            type="button"
            title={tk("case_key_image_reset_zoom")}
            aria-label={tk("case_key_image_reset_zoom")}
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
              scaleRef.current = 1;
              panRef.current = { x: 0, y: 0 };
            }}
            className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            1×
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div
            ref={viewportRef}
            className={`relative flex h-[min(55vh,520px)] touch-none items-center justify-center overflow-hidden overscroll-contain rounded-md border border-[var(--border)] bg-black/40 ${
              tool === "draw" ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {loading && (
              <p className="absolute text-sm text-[var(--muted)]">{tk("ui_loading")}</p>
            )}
            {loadError && (
              <p className="absolute text-sm text-[var(--danger)]">{loadError}</p>
            )}
            {displaySrc && (
              <div
                ref={imageWrapRef}
                className="relative inline-block max-h-full max-w-full"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: "center center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displaySrc}
                  alt={filename}
                  className="block max-h-[min(55vh,520px)] max-w-full select-none object-contain"
                  draggable={false}
                />
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {fileMarks.map((m) => {
                    const pts = markPoints(m);
                    const d = strokePathD(pts);
                    if (!d) return null;
                    const selected = selectedId === m.id;
                    const canDelete = canDeleteOthers || m.authorId === currentUserId;
                    return (
                      <path
                        key={m.id}
                        d={d}
                        fill="none"
                        stroke={m.color || PEN_COLOR}
                        strokeWidth={selected ? 2.5 : 2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={selected ? 1 : 0.85}
                        vectorEffect="non-scaling-stroke"
                        className={canDelete ? "pointer-events-auto cursor-pointer" : undefined}
                        style={{ pointerEvents: canDelete ? "stroke" : "none" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(m.id);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (canDelete) void removeMark(m.id);
                        }}
                      >
                        <title>
                          {canDelete
                            ? tk("case_key_image_stroke_dblclick_hint")
                            : m.authorName}
                        </title>
                      </path>
                    );
                  })}
                  {livePath && (
                    <path
                      d={livePath}
                      fill="none"
                      stroke={PEN_COLOR}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <span className="shrink-0 text-xs text-[var(--muted)]">{tk("case_key_image_zoom")}</span>
            <button
              type="button"
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--surface)]"
              onClick={() => setScaleFromSlider(scale / 1.15)}
              aria-label={tk("case_key_image_zoom_out")}
            >
              −
            </button>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={scale}
              onChange={(e) => setScaleFromSlider(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[var(--accent)]"
              aria-label={tk("case_key_image_zoom")}
            />
            <button
              type="button"
              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--surface)]"
              onClick={() => setScaleFromSlider(scale * 1.15)}
              aria-label={tk("case_key_image_zoom_in")}
            >
              +
            </button>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--text)]">
              {Math.round(scale * 100)}%
            </span>
          </div>

          <p className="text-[11px] text-[var(--muted)]">
            {tool === "pan" ? tk("case_key_image_hand_hint") : tk("case_key_image_pen_hint")}
          </p>

          {actionError && <p className="text-sm text-[var(--danger)]">{actionError}</p>}
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-2 lg:w-56">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {tk("case_key_image_marks_title")} ({fileMarks.length})
        </h4>
        {fileMarks.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{tk("case_key_image_marks_empty")}</p>
        ) : (
          <ul className="m-0 max-h-[50vh] list-none space-y-2 overflow-auto p-0">
            {fileMarks.map((m, i) => {
              const canDelete = canDeleteOthers || m.authorId === currentUserId;
              return (
                <li key={m.id}>
                  <div
                    className={`rounded-md border px-2.5 py-2 text-xs ${
                      selectedId === m.id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setSelectedId(m.id)}
                    >
                      <span
                        className="inline-block h-2 w-6 rounded-full"
                        style={{ background: m.color || PEN_COLOR }}
                      />
                      <span className="truncate text-[var(--muted)]">
                        {tk("case_key_image_mark_label")} {i + 1} · {m.authorName}
                      </span>
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeMark(m.id)}
                        className="mt-1.5 text-[11px] text-[var(--danger)] hover:underline disabled:opacity-50"
                      >
                        {tk("case_key_image_mark_delete")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}

export function KeyImageModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
