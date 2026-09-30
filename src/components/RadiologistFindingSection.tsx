"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FindingHighlight } from "@/lib/finding-highlights";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Segment =
  | { type: "text"; value: string; start: number }
  | { type: "mark"; value: string; start: number; highlight: FindingHighlight };

type SelectionPopup = {
  start: number;
  end: number;
  top: number;
  left: number;
};

function buildSegments(text: string, highlights: FindingHighlight[]): Segment[] {
  if (!text) return [];
  const sorted = [...highlights]
    .filter((h) => h.end > h.start && h.start < text.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const kept: FindingHighlight[] = [];
  let cursor = 0;
  for (const h of sorted) {
    const start = Math.max(h.start, 0);
    const end = Math.min(h.end, text.length);
    if (end <= cursor) continue;
    const clipped = start < cursor ? { ...h, start: cursor, end } : { ...h, start, end };
    if (clipped.end <= clipped.start) continue;
    kept.push(clipped);
    cursor = clipped.end;
  }

  const segments: Segment[] = [];
  let i = 0;
  for (const h of kept) {
    if (h.start > i) {
      segments.push({ type: "text", value: text.slice(i, h.start), start: i });
    }
    segments.push({
      type: "mark",
      value: text.slice(h.start, h.end),
      start: h.start,
      highlight: h,
    });
    i = h.end;
  }
  if (i < text.length) {
    segments.push({ type: "text", value: text.slice(i), start: i });
  }
  return segments;
}

function selectionOffsetsIn(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const selected = range.toString();
  const end = start + selected.length;
  if (end <= start) return null;
  if (!selected.trim()) return null;
  return { start, end };
}

export function RadiologistFindingSection({
  lang,
  caseDbId,
  text,
}: {
  lang: Lang;
  caseDbId: string;
  text: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [highlights, setHighlights] = useState<FindingHighlight[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<SelectionPopup | null>(null);
  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/finding-highlights`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        highlights?: FindingHighlight[];
        currentUserId?: string;
        isReviewer?: boolean;
      };
      setHighlights(Array.isArray(data.highlights) ? data.highlights : []);
      setCurrentUserId(data.currentUserId ?? null);
      setIsReviewer(data.isReviewer === true);
    } catch {
      setError(tk("finding_highlight_load_error"));
    } finally {
      setLoading(false);
    }
  }, [caseDbId, lang]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!popup) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (popupRef.current?.contains(target)) return;
      if (bodyRef.current?.contains(target)) return;
      setPopup(null);
      setPending(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [popup]);

  const displayHighlights = useMemo((): FindingHighlight[] => {
    if (!pending) return highlights;
    const temp: FindingHighlight = {
      id: "__pending__",
      start: pending.start,
      end: pending.end,
      note: "",
      authorId: currentUserId ?? "",
      authorName: "",
      createdAt: "",
      updatedAt: "",
    };
    return [...highlights, temp];
  }, [highlights, pending, currentUserId]);

  const segments = useMemo(
    () => buildSegments(text, displayHighlights),
    [text, displayHighlights],
  );

  function canRemove(h: FindingHighlight) {
    return isReviewer || h.authorId === currentUserId;
  }

  function updatePopupFromSelection() {
    const body = bodyRef.current;
    const wrap = wrapRef.current;
    if (!body || !wrap) return;
    const offsets = selectionOffsetsIn(body);
    if (!offsets) {
      setPopup(null);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setPopup(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPopup(null);
      return;
    }
    setPopup({
      start: offsets.start,
      end: offsets.end,
      top: rect.bottom - wrapRect.top + 6,
      left: Math.min(
        Math.max(rect.left - wrapRect.left + rect.width / 2, 48),
        wrapRect.width - 48,
      ),
    });
  }

  async function applyHighlightFromPopup() {
    if (!popup || busy) return;
    const range = { start: popup.start, end: popup.end };
    setPending(range);
    setPopup(null);
    window.getSelection()?.removeAllRanges();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/finding-highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: range.start,
          end: range.end,
          note: "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; highlights?: FindingHighlight[] };
      if (!res.ok || !data.ok || !data.highlights) {
        setError(tk("finding_highlight_save_error"));
        setPending(null);
        return;
      }
      setHighlights(data.highlights);
      setPending(null);
    } catch {
      setError(tk("finding_highlight_save_error"));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  async function removeHighlight(h: FindingHighlight) {
    if (!canRemove(h) || busy || h.id === "__pending__") return;
    // Optimistic: remove from UI immediately.
    const previous = highlights;
    setHighlights((list) => list.filter((item) => item.id !== h.id));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cases/${caseDbId}/finding-highlights?id=${encodeURIComponent(h.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; highlights?: FindingHighlight[] };
      if (!res.ok || !data.ok || !data.highlights) {
        setHighlights(previous);
        setError(tk("finding_highlight_save_error"));
        return;
      }
      setHighlights(data.highlights);
    } catch {
      setHighlights(previous);
      setError(tk("finding_highlight_save_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="md:col-span-2">
      <dt className="sr-only">{tk("case_radiologist_finding")}</dt>
      <dd className="m-0">
        <details
          open={open}
          onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)]"
        >
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]">
            {tk("case_radiologist_finding")}
            {highlights.length > 0 ? (
              <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                {highlights.length}
              </span>
            ) : null}
          </summary>
          <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
            <p className="text-[11px] text-[var(--muted)]">
              {tk("finding_highlight_select_hint")}
              {loading ? ` · ${tk("ui_loading")}` : ""}
            </p>

            <div ref={wrapRef} className="relative">
              <div
                ref={bodyRef}
                onMouseUp={() => {
                  window.requestAnimationFrame(updatePopupFromSelection);
                }}
                onTouchEnd={() => {
                  window.setTimeout(updatePopupFromSelection, 50);
                }}
                className="select-text rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-[var(--text)]"
              >
                {segments.map((seg, idx) =>
                  seg.type === "text" ? (
                    <span key={`t-${seg.start}-${idx}`}>{seg.value}</span>
                  ) : (
                    <mark
                      key={seg.highlight.id}
                      title={
                        seg.highlight.id === "__pending__"
                          ? tk("finding_highlight_tool")
                          : canRemove(seg.highlight)
                            ? tk("finding_highlight_dblclick_hint")
                            : seg.highlight.authorName
                      }
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.getSelection()?.removeAllRanges();
                        void removeHighlight(seg.highlight);
                      }}
                      className={`rounded-[2px] px-0.5 py-[1px] ${
                        seg.highlight.id === "__pending__"
                          ? "bg-amber-300/90 text-black"
                          : "cursor-pointer bg-amber-400/80 text-black hover:bg-amber-300"
                      }`}
                    >
                      {seg.value}
                    </mark>
                  ),
                )}
              </div>

              {popup && (
                <div
                  ref={popupRef}
                  className="absolute z-20 -translate-x-1/2"
                  style={{ top: popup.top, left: popup.left }}
                >
                  <div className="flex items-center gap-1 rounded-md border border-amber-400/60 bg-[var(--surface)] p-1 shadow-lg">
                    <button
                      type="button"
                      disabled={busy}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void applyHighlightFromPopup()}
                      className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                        <path d="M4 19h16v2H4v-2zm2.5-3.5 9.8-9.8 2.5 2.5-9.8 9.8H6.5v-2.5zM17.4 4.1a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 0 1 0 1.4l-1.1 1.1-2.5-2.5 1.1-1.1z" />
                      </svg>
                      {tk("finding_highlight_tool")}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPopup(null);
                        setPending(null);
                      }}
                      className="rounded px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                      aria-label={tk("drawer_close")}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </div>
        </details>
      </dd>
    </div>
  );
}
