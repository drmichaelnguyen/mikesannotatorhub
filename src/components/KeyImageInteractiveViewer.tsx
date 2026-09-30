"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDicomFilename } from "@/lib/key-image-path";
import { paintDicomOnCanvas, renderDicomToImageData } from "@/lib/dicom-render";
import type { KeyImageMark } from "@/lib/key-image-annotations";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const MIN_SCALE = 1;
const MAX_SCALE = 8;

type Tool = "pan" | "mark";

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
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
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

  // Reset view when switching images.
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setDraft(null);
    setDraftNote("");
    setSelectedId(null);
    setEditNote("");
    setActionError(null);
    setTool("pan");
  }, [filename]);

  // Resolve display URL (DICOM → PNG blob).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tk depends on lang; reload on src/filename
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

  // Capture wheel on the viewport so parent drawers/lists cannot scroll.
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

  function onPointerDown(e: React.PointerEvent) {
    if (tool !== "pan") return;
    if (e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    setDragging(true);
    dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragOrigin.current) return;
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    const next = {
      x: dragOrigin.current.panX + dx,
      y: dragOrigin.current.panY + dy,
    };
    panRef.current = next;
    setPan(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    dragOrigin.current = null;
  }

  function clientToNormalized(clientX: number, clientY: number): { x: number; y: number } | null {
    const wrap = imageWrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function onImageClick(e: React.MouseEvent) {
    if (tool !== "mark") return;
    if (dragging) return;
    const coords = clientToNormalized(e.clientX, e.clientY);
    if (!coords) return;
    setSelectedId(null);
    setDraft(coords);
    setDraftNote("");
    setActionError(null);
  }

  async function saveDraft() {
    if (!draft || !draftNote.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/key-images/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          x: draft.x,
          y: draft.y,
          note: draftNote.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; marks?: KeyImageMark[]; error?: string };
      if (!res.ok || !data.ok || !data.marks) {
        setActionError(tk("case_key_image_mark_save_error"));
        return;
      }
      onMarksChange(data.marks);
      setDraft(null);
      setDraftNote("");
      setTool("pan");
    } catch {
      setActionError(tk("case_key_image_mark_save_error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(mark: KeyImageMark) {
    if (!editNote.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/key-images/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mark.id,
          filename: mark.filename,
          x: mark.x,
          y: mark.y,
          note: editNote.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; marks?: KeyImageMark[] };
      if (!res.ok || !data.ok || !data.marks) {
        setActionError(tk("case_key_image_mark_save_error"));
        return;
      }
      onMarksChange(data.marks);
      setSelectedId(null);
    } catch {
      setActionError(tk("case_key_image_mark_save_error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeMark(markId: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/cases/${caseDbId}/key-images/annotations?id=${encodeURIComponent(markId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; marks?: KeyImageMark[] };
      if (!res.ok || !data.ok || !data.marks) {
        setActionError(tk("case_key_image_mark_save_error"));
        return;
      }
      onMarksChange(data.marks);
      if (selectedId === markId) setSelectedId(null);
    } catch {
      setActionError(tk("case_key_image_mark_save_error"));
    } finally {
      setBusy(false);
    }
  }

  const selected = fileMarks.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-w-0 flex-1 gap-2">
        {/* Side tool rail */}
        <div className="flex shrink-0 flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1.5">
          <button
            type="button"
            title={tk("case_key_image_tool_hand")}
            aria-label={tk("case_key_image_tool_hand")}
            aria-pressed={tool === "pan"}
            onClick={() => {
              setTool("pan");
              setDraft(null);
            }}
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
            aria-pressed={tool === "mark"}
            onClick={() => setTool("mark")}
            className={`flex h-10 w-10 items-center justify-center rounded-md ${
              tool === "mark"
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
              tool === "mark" ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "cursor-grab"
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
                onClick={onImageClick}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displaySrc}
                  alt={filename}
                  className="block max-h-[min(55vh,520px)] max-w-full select-none object-contain"
                  draggable={false}
                />
                {fileMarks.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.note}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft(null);
                      setSelectedId(m.id);
                      setEditNote(m.note);
                      setTool("pan");
                    }}
                    className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ring-2 ring-white/80 ${
                      selectedId === m.id ? "bg-[var(--accent)]" : "bg-[var(--danger)]"
                    }`}
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                  >
                    {i + 1}
                  </button>
                ))}
                {draft && (
                  <span
                    className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--warn)] text-[10px] font-bold text-black shadow ring-2 ring-white/80"
                    style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                  >
                    +
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bottom zoom slider */}
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

          {draft && (
            <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--surface)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text)]">
                {tk("case_key_image_mark_new")}
              </p>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={3}
                placeholder={tk("case_key_image_mark_note_placeholder")}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !draftNote.trim()}
                  onClick={() => void saveDraft()}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {tk("case_key_image_mark_save")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setDraftNote("");
                  }}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
                >
                  {tk("discussion_cancel_edit")}
                </button>
              </div>
            </div>
          )}

          {selected && !draft && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  {tk("case_key_image_mark_label")} #
                  {fileMarks.findIndex((m) => m.id === selected.id) + 1}
                </p>
                <p className="text-[10px] text-[var(--muted)]">{selected.authorName}</p>
              </div>
              {canDeleteOthers || selected.authorId === currentUserId ? (
                <>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !editNote.trim() || editNote.trim() === selected.note}
                      onClick={() => void saveEdit(selected)}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      {tk("case_key_image_mark_save")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeMark(selected.id)}
                      className="rounded-md border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                    >
                      {tk("case_key_image_mark_delete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
                    >
                      {tk("drawer_close")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{selected.note}</p>
              )}
            </div>
          )}

          {actionError && <p className="text-sm text-[var(--danger)]">{actionError}</p>}
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-2 lg:w-64">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {tk("case_key_image_marks_title")} ({fileMarks.length})
        </h4>
        {fileMarks.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{tk("case_key_image_marks_empty")}</p>
        ) : (
          <ul className="m-0 max-h-[50vh] list-none space-y-2 overflow-auto p-0">
            {fileMarks.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setSelectedId(m.id);
                    setEditNote(m.note);
                  }}
                  className={`w-full rounded-md border px-2.5 py-2 text-left text-xs ${
                    selectedId === m.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] hover:bg-[var(--bg)]"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="truncate text-[var(--muted)]">{m.authorName}</span>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-[var(--text)]">{m.note}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** Optional helper: portal host for key-image modal (used by CaseKeyImagesSection). */
export function KeyImageModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
