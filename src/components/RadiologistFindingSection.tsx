"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FindingHighlight } from "@/lib/finding-highlights";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Segment =
  | { type: "text"; value: string; start: number }
  | { type: "mark"; value: string; start: number; highlight: FindingHighlight };

function buildSegments(text: string, highlights: FindingHighlight[]): Segment[] {
  if (!text) return [];
  const sorted = [...highlights]
    .filter((h) => h.end > h.start && h.start < text.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Resolve overlaps by skipping later ranges that intersect earlier ones.
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
  // Ignore selection that is only whitespace.
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState<FindingHighlight[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

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

  const segments = useMemo(() => buildSegments(text, highlights), [text, highlights]);
  const selected = highlights.find((h) => h.id === selectedId) ?? null;

  function onMouseUp() {
    if (!highlightMode || !bodyRef.current) return;
    const offsets = selectionOffsetsIn(bodyRef.current);
    window.getSelection()?.removeAllRanges();
    if (!offsets) return;
    setSelectedId(null);
    setDraft(offsets);
    setDraftNote("");
    setError(null);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/finding-highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: draft.start,
          end: draft.end,
          note: draftNote.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; highlights?: FindingHighlight[] };
      if (!res.ok || !data.ok || !data.highlights) {
        setError(tk("finding_highlight_save_error"));
        return;
      }
      setHighlights(data.highlights);
      setDraft(null);
      setDraftNote("");
      setHighlightMode(false);
    } catch {
      setError(tk("finding_highlight_save_error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(h: FindingHighlight) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseDbId}/finding-highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: h.id,
          start: h.start,
          end: h.end,
          note: editNote.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; highlights?: FindingHighlight[] };
      if (!res.ok || !data.ok || !data.highlights) {
        setError(tk("finding_highlight_save_error"));
        return;
      }
      setHighlights(data.highlights);
      setSelectedId(null);
    } catch {
      setError(tk("finding_highlight_save_error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeHighlight(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cases/${caseDbId}/finding-highlights?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; highlights?: FindingHighlight[] };
      if (!res.ok || !data.ok || !data.highlights) {
        setError(tk("finding_highlight_save_error"));
        return;
      }
      setHighlights(data.highlights);
      if (selectedId === id) setSelectedId(null);
    } catch {
      setError(tk("finding_highlight_save_error"));
    } finally {
      setBusy(false);
    }
  }

  const draftPreview =
    draft && draft.end > draft.start ? text.slice(draft.start, draft.end) : "";

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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={highlightMode}
                onClick={() => {
                  setHighlightMode((v) => !v);
                  setDraft(null);
                  setSelectedId(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                  highlightMode
                    ? "border-amber-400 bg-amber-500/20 text-amber-100"
                    : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)]"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                  <path d="M4 19h16v2H4v-2zm2.5-3.5 9.8-9.8 2.5 2.5-9.8 9.8H6.5v-2.5zM17.4 4.1a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 0 1 0 1.4l-1.1 1.1-2.5-2.5 1.1-1.1z" />
                </svg>
                {tk("finding_highlight_tool")}
              </button>
              {highlightMode && (
                <span className="text-[11px] text-[var(--muted)]">{tk("finding_highlight_hint")}</span>
              )}
              {loading && <span className="text-[11px] text-[var(--muted)]">{tk("ui_loading")}</span>}
            </div>

            <div
              ref={bodyRef}
              onMouseUp={onMouseUp}
              className={`rounded-md border px-3 py-2 text-sm whitespace-pre-wrap text-[var(--text)] ${
                highlightMode
                  ? "border-amber-400/50 bg-[var(--surface)] select-text cursor-text"
                  : "border-transparent bg-transparent"
              }`}
            >
              {segments.map((seg, idx) =>
                seg.type === "text" ? (
                  <span key={`t-${seg.start}-${idx}`}>{seg.value}</span>
                ) : (
                  <mark
                    key={seg.highlight.id}
                    title={
                      seg.highlight.note
                        ? `${seg.highlight.authorName}: ${seg.highlight.note}`
                        : seg.highlight.authorName
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (highlightMode) return;
                      setDraft(null);
                      setSelectedId(seg.highlight.id);
                      setEditNote(seg.highlight.note);
                    }}
                    className={`rounded-sm px-0.5 py-0.5 ${
                      selectedId === seg.highlight.id
                        ? "bg-amber-300 text-black ring-2 ring-amber-200"
                        : "cursor-pointer bg-amber-400/70 text-black hover:bg-amber-300"
                    }`}
                  >
                    {seg.value}
                  </mark>
                ),
              )}
            </div>

            {draft && (
              <div className="rounded-md border border-amber-400/40 bg-[var(--surface)] p-3">
                <p className="mb-1 text-xs font-medium">{tk("finding_highlight_new")}</p>
                <p className="mb-2 rounded bg-amber-400/30 px-2 py-1 text-xs whitespace-pre-wrap text-[var(--text)]">
                  {draftPreview}
                </p>
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={2}
                  placeholder={tk("finding_highlight_note_placeholder")}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                  autoFocus
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {tk("finding_highlight_save")}
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
                  <p className="text-xs font-medium">{tk("finding_highlight_selected")}</p>
                  <p className="text-[10px] text-[var(--muted)]">{selected.authorName}</p>
                </div>
                <p className="mb-2 rounded bg-amber-400/30 px-2 py-1 text-xs whitespace-pre-wrap">
                  {text.slice(selected.start, selected.end)}
                </p>
                {isReviewer || selected.authorId === currentUserId ? (
                  <>
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                      placeholder={tk("finding_highlight_note_placeholder")}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || editNote.trim() === selected.note}
                        onClick={() => void saveEdit(selected)}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        {tk("finding_highlight_save")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeHighlight(selected.id)}
                        className="rounded-md border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                      >
                        {tk("finding_highlight_delete")}
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
                  <p className="whitespace-pre-wrap text-sm text-[var(--text)]">
                    {selected.note.trim() || "—"}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </div>
        </details>
      </dd>
    </div>
  );
}
