"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCaseNoteAction } from "@/app/actions/cases";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { UserRole } from "@prisma/client";

export type CaseDiscussionNote = {
  id: string;
  content: string | null;
  imageData: string | null;
  createdAt: string;
  author: { name: string; role: UserRole };
};

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
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [markedImage, setMarkedImage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setRawImage(String(r.result));
      setMarkedImage(null);
    };
    r.readAsDataURL(f);
  }

  function post() {
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId,
        content,
        imageData: markedImage ?? rawImage,
      });
      if (!res.ok) {
        setErr(res.error === "empty" ? tk("discussion_need_body") : tk("required"));
        return;
      }
      setContent("");
      setRawImage(null);
      setMarkedImage(null);
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
              {n.imageData ? (
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={n.imageData}
                    alt=""
                    className="max-h-64 max-w-full rounded border border-[var(--border)] object-contain"
                  />
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
              rows={2}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-2">
            <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
            <input type="file" accept="image/*" onChange={onFile} className="mt-1 block text-sm" />
          </div>
          {(rawImage || markedImage) && (
            <div className="mt-2">
              <ScreenshotDrawer
                lang={lang}
                imageDataUrl={markedImage ?? rawImage}
                onChange={(d) => setMarkedImage(d)}
              />
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
