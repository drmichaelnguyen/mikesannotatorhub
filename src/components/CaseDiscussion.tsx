"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { addCaseNoteAction } from "@/app/actions/cases";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { getClipboardImageFiles, readFilesAsDataUrls } from "@/lib/client-image-data";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { UserRole } from "@prisma/client";

export type CaseDiscussionNote = {
  id: string;
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

export function CaseDiscussion({
  lang,
  caseDbId,
  notes,
  canPost,
}: {
  lang: Lang;
  caseDbId: string;
  notes: CaseDiscussionNote[];
  canPost: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  function post() {
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId,
        content,
        imageDataList: images,
      });
      if (!res.ok) {
        setErr(res.error === "empty" ? tk("discussion_need_body") : tk("required"));
        return;
      }
      setContent("");
      setImages([]);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <h4 className="mb-2 font-medium">{tk("discussion_title")}</h4>
      {notes.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--muted)]">{tk("discussion_empty")}</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--text)]">{n.author.name}</span>
                <span className="rounded bg-[var(--surface)] px-1.5 py-0.5">
                  {n.author.role === "REVIEWER" ? tk("role_reviewer") : tk("role_annotator")}
                </span>
                <span>{formatDate(lang, new Date(n.createdAt))}</span>
              </div>
              {n.content ? <p className="mt-2 whitespace-pre-wrap text-[var(--text)]">{n.content}</p> : null}
              {n.images.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.images.map((image, index) => (
                    <NoteImageThumbnail key={`${n.id}-${index}`} lang={lang} src={image} alt="" />
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canPost && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
          <label className="block">
            <span className="text-sm text-[var(--muted)]">{tk("review_comment")}</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={onPasteComposer}
              rows={2}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
          <button
            type="button"
            disabled={pending}
            onClick={post}
            className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {tk("discussion_post")}
          </button>
        </div>
      )}
    </div>
  );
}
