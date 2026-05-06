"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  translateDiscussionForExportAction,
} from "@/app/actions/export";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { createCaseNote, fetchCaseNotes } from "@/lib/case-note-api";
import { getClipboardImageFiles, readFilesAsDataUrls } from "@/lib/client-image-data";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";
import type { UserRole } from "@prisma/client";

export type CaseDiscussionNote = {
  id: string;
  parentNoteId: string | null;
  content: string | null;
  images: string[];
  createdAt: string;
  author: { name: string; role: UserRole };
};

function NoteImageThumbnail({
  lang,
  src,
  alt,
}: {
  lang: Lang;
  src: string;
  alt: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 text-left shadow-sm transition hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] sm:h-24 sm:w-24"
          aria-label={tk("discussion_expand_image")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded object-contain"
            loading="lazy"
          />
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-label={tk("discussion_expand_image")}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] max-w-[min(96vw,56rem)] cursor-default overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="max-h-[85vh] w-auto max-w-full object-contain" />
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
              onClick={() => setOpen(false)}
            >
              {tk("drawer_close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

type DiscussionNode = CaseDiscussionNote & { children: DiscussionNode[] };

type ExportRow = {
  noteId: string;
  image: string | null;
  comment: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
};

type ExportCommentRow = {
  noteId: string;
  comment: string;
};

function flattenDiscussion(nodes: DiscussionNode[]): DiscussionNode[] {
  const out: DiscussionNode[] = [];
  function visit(node: DiscussionNode) {
    out.push(node);
    for (const child of node.children) visit(child);
  }
  for (const node of nodes) visit(node);
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildExportRows(nodes: DiscussionNode[]): ExportRow[] {
  return flattenDiscussion(nodes).reduce<ExportRow[]>((rows, note) => {
    const content = note.content?.trim() ?? "";
    const base = {
      noteId: note.id,
      comment: content,
      authorName: note.author.name,
      authorRole: note.author.role,
      createdAt: note.createdAt,
    };
    if (note.images.length === 0) {
      rows.push({ ...base, image: null });
      return rows;
    }
    for (const image of note.images) rows.push({ ...base, image });
    return rows;
  }, []);
}

function buildExportCommentRows(nodes: DiscussionNode[]): ExportCommentRow[] {
  return flattenDiscussion(nodes).reduce<ExportCommentRow[]>((rows, note) => {
    const content = note.content?.trim() ?? "";
    if (!content) return rows;
    rows.push({
      noteId: note.id,
      comment: content,
    });
    return rows;
  }, []);
}

function buildClipboardHtml({
  rows,
  lang,
  caseLabel,
}: {
  rows: ExportRow[];
  lang: Lang;
  caseLabel?: string;
}) {
  const title = caseLabel
    ? `${escapeHtml(caseLabel)} - ${escapeHtml(t(lang, "discussion_export_title"))}`
    : escapeHtml(t(lang, "discussion_export_title"));
  const imageHeading = escapeHtml(t(lang, "discussion_export_image_col"));
  const commentHeading = escapeHtml(t(lang, "discussion_export_comment_col"));

  const tableRows = rows
    .map((row) => {
      const commentParts = row.comment ? [escapeHtml(row.comment)] : [];
      const imageCell = row.image
        ? `<img src="${row.image}" alt="" style="display:block;max-width:320px;max-height:240px;width:auto;height:auto;border:1px solid #d4d4d8;border-radius:6px;" />`
        : `<div style="color:#999;font-size:12px;">${escapeHtml(t(lang, "discussion_export_no_image"))}</div>`;

      return `<tr>
  <td style="width:38%;vertical-align:top;border:1px solid #d4d4d8;padding:10px;background:#fff;">${imageCell}</td>
  <td style="width:62%;vertical-align:top;border:1px solid #d4d4d8;padding:10px;background:#fff;white-space:pre-wrap;">${commentParts.join("")}</td>
</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
  <body>
    <div style="font-family:Arial,sans-serif;color:#111;">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px;">${title}</div>
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <thead>
          <tr>
            <th style="text-align:left;border:1px solid #d4d4d8;padding:10px;background:#f4f4f5;">${imageHeading}</th>
            <th style="text-align:left;border:1px solid #d4d4d8;padding:10px;background:#f4f4f5;">${commentHeading}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

function buildClipboardText({
  rows,
  lang,
  caseLabel,
}: {
  rows: ExportRow[];
  lang: Lang;
  caseLabel?: string;
}) {
  const title = caseLabel
    ? `${caseLabel} - ${t(lang, "discussion_export_title")}`
    : t(lang, "discussion_export_title");

  return [
    title,
    "",
    ...rows.map((row, index) => {
      return [
        `${index + 1}. ${t(lang, "discussion_export_image_col")}: ${
          row.image ? t(lang, "discussion_export_image_included") : t(lang, "discussion_export_no_image")
        }`,
        `${t(lang, "discussion_export_comment_col")}: ${row.comment || "—"}`,
      ].join("\n");
    }),
  ].join("\n");
}

function buildCommentsOnlyClipboardHtml({
  rows,
  lang,
  caseLabel,
}: {
  rows: ExportCommentRow[];
  lang: Lang;
  caseLabel?: string;
}) {
  const titleBase = t(lang, "discussion_export_text_only");
  const title = caseLabel
    ? `${escapeHtml(caseLabel)} - ${escapeHtml(titleBase)}`
    : escapeHtml(titleBase);

  const blocks = rows
    .map((row, index) => {
      return `<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e4e4e7;">
  <div style="margin-bottom:6px;color:#666;font-size:12px;">${index + 1}.</div>
  <div style="white-space:pre-wrap;">${escapeHtml(row.comment)}</div>
</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
  <body>
    <div style="font-family:Arial,sans-serif;color:#111;">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px;">${title}</div>
      ${blocks}
    </div>
  </body>
</html>`;
}

function buildCommentsOnlyClipboardText({
  rows,
  lang,
  caseLabel,
}: {
  rows: ExportCommentRow[];
  lang: Lang;
  caseLabel?: string;
}) {
  const title = caseLabel
    ? `${caseLabel} - ${t(lang, "discussion_export_text_only")}`
    : t(lang, "discussion_export_text_only");

  return [
    title,
    "",
    ...rows.map((row) => row.comment),
  ].join("\n\n");
}

async function copyExportToClipboard(html: string, text: string) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to broader compatibility paths.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy copy support.
  }

  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  const listener = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("text/html", html);
    event.clipboardData?.setData("text/plain", text);
  };

  const marker = document.createElement("div");
  marker.setAttribute("contenteditable", "true");
  marker.setAttribute("aria-hidden", "true");
  marker.style.position = "fixed";
  marker.style.pointerEvents = "none";
  marker.style.opacity = "0";
  marker.style.inset = "0";
  marker.innerHTML = html;
  document.body.appendChild(marker);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(marker);
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.addEventListener("copy", listener);

  try {
    const ok = document.execCommand("copy");
    selection?.removeAllRanges();
    document.removeEventListener("copy", listener);
    marker.remove();
    return ok;
  } catch {
    selection?.removeAllRanges();
    document.removeEventListener("copy", listener);
    marker.remove();
    return false;
  }
}

function buildDiscussionTree(notes: CaseDiscussionNote[]): DiscussionNode[] {
  const byId = new Map<string, DiscussionNode>();
  const roots: DiscussionNode[] = [];
  for (const note of notes) {
    byId.set(note.id, { ...note, children: [] });
  }
  for (const note of notes) {
    const node = byId.get(note.id)!;
    if (note.parentNoteId && byId.has(note.parentNoteId)) {
      byId.get(note.parentNoteId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function MentionTextarea({
  lang,
  value,
  onChange,
  onPaste,
  rows,
  placeholder,
  mentionOptions,
  autoFocus = false,
}: {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  rows: number;
  placeholder?: string;
  mentionOptions: MentionOption[];
  autoFocus?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [queryState, setQueryState] = useState<{ open: boolean; start: number; query: string }>({
    open: false,
    start: -1,
    query: "",
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const matches = queryState.open
    ? mentionOptions.filter((opt) => opt.label.toLowerCase().includes(queryState.query.toLowerCase()))
    : [];

  function updateQuery(nextValue: string, cursor = textareaRef.current?.selectionStart ?? nextValue.length) {
    const before = nextValue.slice(0, cursor);
    const match = before.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      setQueryState({ open: false, start: -1, query: "" });
      setActiveIndex(0);
      return;
    }
    const query = match[2] ?? "";
    setQueryState({ open: true, start: cursor - query.length - 1, query });
    setActiveIndex(0);
  }

  function insertMention(opt: MentionOption) {
    if (!queryState.open) return;
    const current = value;
    const cursor = textareaRef.current?.selectionStart ?? current.length;
    const start = queryState.start >= 0 ? queryState.start : cursor;
    const next = `${current.slice(0, start)}@${opt.label} ${current.slice(cursor)}`;
    onChange(next);
    setQueryState({ open: false, start: -1, query: "" });
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const nextPos = start + opt.label.length + 2;
      el.focus();
      el.setSelectionRange(nextPos, nextPos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => e.stopPropagation()}
        onKeyUpCapture={(e) => e.stopPropagation()}
        onKeyUp={(e) => updateQuery((e.target as HTMLTextAreaElement).value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
        onKeyDown={(e) => {
          if (!queryState.open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(matches[activeIndex]);
          } else if (e.key === "Escape") {
            setQueryState({ open: false, start: -1, query: "" });
          }
        }}
        onPaste={onPaste}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      />
      {queryState.open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">{tk("reviewer_mention_no_results")}</div>
          ) : (
            <ul role="listbox" className="max-h-56 overflow-auto py-1 text-sm">
              {matches.map((opt, index) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left ${
                      index === activeIndex ? "bg-[var(--bg)]" : "hover:bg-[var(--bg)]/70"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(opt);
                    }}
                  >
                    <span>{opt.label}</span>
                    <span className="text-xs text-[var(--muted)]">{opt.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-[var(--border)] px-3 py-1 text-[10px] text-[var(--muted)]">
            {tk("reviewer_mention_hint")}
          </div>
        </div>
      )}
    </div>
  );
}

type ComposerState = {
  value: string;
  images: string[];
  err: string | null;
  pending: boolean;
  mentionOptions: MentionOption[];
  onChange: (value: string) => void;
  onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onUpdateImage: (index: number, url: string | null) => void;
  onPost: (parentNoteId: string | null) => void;
  onCancelReply: () => void;
};

function Composer({
  lang,
  state,
  parentNoteId,
  compact = false,
}: {
  lang: Lang;
  state: ComposerState;
  parentNoteId: string | null;
  compact?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  return (
    <div
      className={
        compact
          ? "mt-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] p-3"
          : "rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
      }
    >
      {parentNoteId ? (
        <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_replying")}</p>
      ) : (
        <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
      )}
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("review_comment")}</span>
        <MentionTextarea
          lang={lang}
          value={state.value}
          onChange={state.onChange}
          onPaste={state.onPaste}
          rows={compact ? 2 : 3}
          placeholder={tk("review_comment")}
          mentionOptions={state.mentionOptions}
          autoFocus={!!parentNoteId}
        />
      </label>
      <div className="mt-2">
        <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
        <input type="file" accept="image/*" multiple onChange={state.onFile} className="mt-1 block text-sm" />
      </div>
      {state.images.length > 0 && (
        <div className="mt-2 space-y-3">
          {state.images.map((image, index) => (
            <div key={`${image.slice(0, 32)}-${index}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">{tk("review_screenshot")} {index + 1}</span>
                <button
                  type="button"
                  onClick={() => state.onRemoveImage(index)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                >
                  {tk("remove_image")}
                </button>
              </div>
              <div className="mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="max-h-40 rounded border border-[var(--border)] object-contain" />
              </div>
              <ScreenshotDrawer
                lang={lang}
                imageDataUrl={image}
                onChange={(dataUrl) => state.onUpdateImage(index, dataUrl)}
              />
            </div>
          ))}
        </div>
      )}
      {state.err && <p className="mt-2 text-sm text-[var(--danger)]">{state.err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {parentNoteId && (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            onClick={state.onCancelReply}
          >
            {tk("discussion_reply_cancel")}
          </button>
        )}
        <button
          type="button"
          disabled={state.pending}
          onClick={() => state.onPost(parentNoteId)}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {parentNoteId ? tk("discussion_reply") : tk("discussion_post")}
        </button>
      </div>
    </div>
  );
}

function NoteItem({
  note,
  depth = 0,
  replyToId,
  canPost,
  lang,
  composerState,
  onToggleReply,
}: {
  note: DiscussionNode;
  depth?: number;
  replyToId: string | null;
  canPost: boolean;
  lang: Lang;
  composerState: ComposerState;
  onToggleReply: (noteId: string) => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const isReplyTarget = replyToId === note.id;
  return (
    <li
      className={`rounded-lg border p-3 text-sm shadow-sm ${
        depth === 0
          ? "border-[var(--border)] bg-[var(--bg)]"
          : "relative ml-4 border-[var(--border)]/70 bg-[var(--surface)]"
      }`}
    >
      <div
        className={
          depth > 0
            ? "relative pl-4 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-[var(--border)]"
            : ""
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]">{note.author.name}</span>
          <span className="rounded bg-[var(--bg)] px-1.5 py-0.5">
            {note.author.role === "REVIEWER" ? tk("role_reviewer") : tk("role_annotator")}
          </span>
          <span>{formatDate(lang, new Date(note.createdAt))}</span>
        </div>
        {note.content ? (
          <p className="mt-2 whitespace-pre-wrap text-[var(--text)]">{note.content}</p>
        ) : null}
        {note.images.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {note.images.map((image, index) => (
              <NoteImageThumbnail key={`${note.id}-${index}`} lang={lang} src={image} alt="" />
            ))}
          </div>
        ) : null}
        {canPost && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
              onClick={() => onToggleReply(note.id)}
            >
              {tk("discussion_reply")}
            </button>
          </div>
        )}
        {isReplyTarget && (
          <Composer lang={lang} state={composerState} parentNoteId={note.id} compact />
        )}
        {note.children.length > 0 && (
          <ul className="mt-3 space-y-3">
            {note.children.map((child) => (
              <NoteItem
                key={child.id}
                note={child}
                depth={(depth ?? 0) + 1}
                replyToId={replyToId}
                canPost={canPost}
                lang={lang}
                composerState={composerState}
                onToggleReply={onToggleReply}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function CaseDiscussion({
  lang,
  caseDbId,
  caseLabel,
  initialNotes = [],
  canPost,
  mentionOptions = [],
}: {
  lang: Lang;
  caseDbId: string;
  caseLabel?: string;
  initialNotes?: CaseDiscussionNote[];
  canPost: boolean;
  mentionOptions?: MentionOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [notes, setNotes] = useState<CaseDiscussionNote[]>(initialNotes);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exportState, setExportState] = useState<
    | "idle"
    | "translating"
    | "copied"
    | "translating_text"
    | "copied_text"
    | "error"
    | "unconfigured"
  >("idle");
  const [pending, start] = useTransition();

  const thread = useMemo(() => buildDiscussionTree(notes), [notes]);
  const exportRows = useMemo(() => buildExportRows(thread), [thread]);
  const exportCommentRows = useMemo(() => buildExportCommentRows(thread), [thread]);
  const exportNotes = useMemo(
    () =>
      flattenDiscussion(thread).map((note) => ({
        id: note.id,
        content: note.content?.trim() ?? "",
      })),
    [thread],
  );

  useEffect(() => {
    if (exportState === "idle") return;
    const timeout = window.setTimeout(() => setExportState("idle"), 1600);
    return () => window.clearTimeout(timeout);
  }, [exportState]);

  const loadNotes = useCallback(async () => {
    const res = await fetchCaseNotes(caseDbId);
    if (res.ok) {
      setNotes(res.notes);
    }
  }, [caseDbId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Use refs so stable callbacks can always read the latest values
  const contentRef = useRef(content);
  contentRef.current = content;
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateImage = useCallback((index: number, dataUrl: string | null) => {
    if (!dataUrl) return;
    setImages((prev) => prev.map((item, i) => (i === index ? dataUrl : item)));
  }, []);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    void readFilesAsDataUrls(files).then((urls) => {
      if (urls.length === 0) return;
      setImages((prev) => [...prev, ...urls]);
    });
    e.target.value = "";
  }, []);

  const onPasteComposer = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getClipboardImageFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    const urls = await readFilesAsDataUrls(files);
    if (urls.length === 0) return;
    setImages((prev) => [...prev, ...urls]);
  }, []);

  const resetComposer = useCallback(() => {
    setContent("");
    setImages([]);
    setReplyToId(null);
  }, []);

  const post = useCallback(
    (parentNoteId: string | null = null) => {
      const currentContent = contentRef.current;
      const currentImages = imagesRef.current;
      setErr(null);
      start(async () => {
        const res = await createCaseNote({
          caseDbId,
          content: currentContent,
          imageDataList: currentImages,
          parentNoteId,
        });
        if (!res.ok) {
          setErr(
            res.error === "empty"
              ? t(lang, "discussion_need_body")
              : res.error === "invalid_parent"
                ? t(lang, "discussion_reply_invalid")
                : t(lang, "required"),
          );
          return;
        }
        resetComposer();
        await loadNotes();
      });
    },
    [caseDbId, lang, loadNotes, resetComposer],
  );

  const cancelReply = useCallback(() => {
    setReplyToId(null);
    setErr(null);
  }, []);

  const toggleReply = useCallback((noteId: string) => {
    setErr(null);
    setReplyToId((prev) => (prev === noteId ? null : noteId));
  }, []);

  const composerState = useMemo<ComposerState>(
    () => ({
      value: content,
      images,
      err,
      pending,
      mentionOptions,
      onChange: setContent,
      onPaste: onPasteComposer,
      onFile,
      onRemoveImage: removeImage,
      onUpdateImage: updateImage,
      onPost: post,
      onCancelReply: cancelReply,
    }),
    [content, images, err, pending, mentionOptions, onPasteComposer, onFile, removeImage, updateImage, post, cancelReply],
  );

  const exportDiscussion = useCallback(async () => {
    if (exportRows.length === 0) {
      setExportState("error");
      return;
    }

    setExportState("translating");

    const translation = await translateDiscussionForExportAction(exportNotes);
    if (!translation.ok) {
      setExportState(translation.error === "unconfigured" ? "unconfigured" : "error");
      return;
    }

    const translatedById = new Map(
      translation.translated.map((item) => [item.id, item.content]),
    );
    const translatedRows = exportRows.map((row) => ({
      ...row,
      comment: translatedById.get(row.noteId) ?? row.comment,
    }));

    const html = buildClipboardHtml({ rows: translatedRows, lang, caseLabel });
    const text = buildClipboardText({ rows: translatedRows, lang, caseLabel });

    try {
      const copied = await copyExportToClipboard(html, text);
      if (!copied) {
        setExportState("error");
        return;
      }
      setExportState("copied");
    } catch {
      setExportState("error");
    }
  }, [caseLabel, exportNotes, exportRows, lang]);

  const exportTextOnlyDiscussion = useCallback(async () => {
    if (exportCommentRows.length === 0) {
      setExportState("error");
      return;
    }

    setExportState("translating_text");

    const translation = await translateDiscussionForExportAction(exportNotes);
    if (!translation.ok) {
      setExportState(translation.error === "unconfigured" ? "unconfigured" : "error");
      return;
    }

    const translatedById = new Map(
      translation.translated.map((item) => [item.id, item.content]),
    );
    const translatedRows = exportCommentRows.map((row) => ({
      ...row,
      comment: translatedById.get(row.noteId) ?? row.comment,
    }));

    const html = buildCommentsOnlyClipboardHtml({
      rows: translatedRows,
      lang,
      caseLabel,
    });
    const text = buildCommentsOnlyClipboardText({
      rows: translatedRows,
      lang,
      caseLabel,
    });

    try {
      const copied = await copyExportToClipboard(html, text);
      if (!copied) {
        setExportState("error");
        return;
      }
      setExportState("copied_text");
    } catch {
      setExportState("error");
    }
  }, [caseLabel, exportCommentRows, exportNotes, lang]);

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">{tk("discussion_title")}</h4>
        <div className="flex items-center gap-2">
          {exportState === "error" && (
            <span className="text-xs text-[var(--danger)]">{tk("discussion_export_failed")}</span>
          )}
          {exportState === "unconfigured" && (
            <span className="text-xs text-[var(--danger)]">{tk("discussion_export_unconfigured")}</span>
          )}
          <button
            type="button"
            onClick={exportDiscussion}
            disabled={exportRows.length === 0 || exportState === "translating" || exportState === "translating_text"}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportState === "translating"
              ? tk("discussion_export_translating")
              : exportState === "copied"
                ? tk("discussion_export_copied")
                : tk("discussion_export")}
          </button>
          <button
            type="button"
            onClick={exportTextOnlyDiscussion}
            disabled={exportCommentRows.length === 0 || exportState === "translating" || exportState === "translating_text"}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportState === "translating_text"
              ? tk("discussion_export_translating")
              : exportState === "copied_text"
                ? tk("discussion_export_text_only_copied")
                : tk("discussion_export_text_only")}
          </button>
        </div>
      </div>
      {thread.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--muted)]">{tk("discussion_empty")}</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {thread.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              depth={0}
              replyToId={replyToId}
              canPost={canPost}
              lang={lang}
              composerState={composerState}
              onToggleReply={toggleReply}
            />
          ))}
        </ul>
      )}
      {canPost && replyToId == null && (
        <Composer lang={lang} state={composerState} parentNoteId={null} />
      )}
    </div>
  );
}
