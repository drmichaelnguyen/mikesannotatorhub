"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addCaseNoteAction } from "@/app/actions/cases";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
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
}: {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  rows: number;
  placeholder?: string;
  mentionOptions: MentionOption[];
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
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
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

export function CaseDiscussion({
  lang,
  caseDbId,
  notes,
  canPost,
  mentionOptions = [],
}: {
  lang: Lang;
  caseDbId: string;
  notes: CaseDiscussionNote[];
  canPost: boolean;
  mentionOptions?: MentionOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const thread = buildDiscussionTree(notes);

  function addImages(dataUrls: string[]) {
    if (dataUrls.length === 0) return;
    setImages((prev) => [...prev, ...dataUrls]);
  }

  function updateImage(index: number, dataUrl: string | null) {
    if (!dataUrl) return;
    setImages((prev) => prev.map((item, i) => (i === index ? dataUrl : item)));
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    void readFilesAsDataUrls(files).then(addImages);
    e.target.value = "";
  }

  const onPasteComposer = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getClipboardImageFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    addImages(await readFilesAsDataUrls(files));
  }, []);

  function resetComposer() {
    setContent("");
    setImages([]);
    setReplyToId(null);
  }

  function post(parentNoteId: string | null = null) {
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId,
        content,
        imageDataList: images,
        parentNoteId,
      });
      if (!res.ok) {
        setErr(
          res.error === "empty"
            ? tk("discussion_need_body")
            : res.error === "invalid_parent"
              ? tk("discussion_reply_invalid")
              : tk("required"),
        );
        return;
      }
      resetComposer();
      router.refresh();
    });
  }

  function Composer({
    parentNoteId,
    compact = false,
  }: {
    parentNoteId: string | null;
    compact?: boolean;
  }) {
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
            value={content}
            onChange={setContent}
            onPaste={onPasteComposer}
            rows={compact ? 2 : 3}
            placeholder={tk("review_comment")}
            mentionOptions={mentionOptions}
          />
        </label>
        <div className="mt-2">
          <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
          <input type="file" accept="image/*" multiple onChange={onFile} className="mt-1 block text-sm" />
        </div>
        {images.length > 0 && (
          <div className="mt-2 space-y-3">
            {images.map((image, index) => (
              <div key={`${image.slice(0, 32)}-${index}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--muted)]">{tk("review_screenshot")} {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
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
                  onChange={(dataUrl) => updateImage(index, dataUrl)}
                />
              </div>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {parentNoteId && (
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              onClick={() => {
                setReplyToId(null);
                setErr(null);
              }}
            >
              {tk("discussion_reply_cancel")}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => post(parentNoteId)}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {parentNoteId ? tk("discussion_reply") : tk("discussion_post")}
          </button>
        </div>
      </div>
    );
  }

  function NoteItem({ note, depth = 0 }: { note: DiscussionNode; depth?: number }) {
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
                onClick={() => {
                  setErr(null);
                  setReplyToId((prev) => (prev === note.id ? null : note.id));
                }}
              >
                {tk("discussion_reply")}
              </button>
            </div>
          )}
          {isReplyTarget && <Composer parentNoteId={note.id} compact />}
          {note.children.length > 0 && (
            <ul className="mt-3 space-y-3">
              {note.children.map((child) => (
                <NoteItem key={child.id} note={child} depth={depth + 1} />
              ))}
            </ul>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <h4 className="mb-2 font-medium">{tk("discussion_title")}</h4>
      {thread.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--muted)]">{tk("discussion_empty")}</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {thread.map((n) => (
            <NoteItem key={n.id} note={n} depth={0} />
          ))}
        </ul>
      )}
      {canPost && replyToId == null && <Composer parentNoteId={null} />}
    </div>
  );
}
