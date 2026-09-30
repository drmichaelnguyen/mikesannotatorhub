"use client";

import { useEffect, useState } from "react";
import {
  KeyImageInteractiveViewer,
  KeyImageModalPortal,
} from "@/components/KeyImageInteractiveViewer";
import { KeyImageView } from "@/components/KeyImageView";
import type { KeyImageMark } from "@/lib/key-image-annotations";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function CaseKeyImagesSection({
  lang,
  caseDbId,
  hasKeyImages,
  keyImageCount = 0,
}: {
  lang: Lang;
  caseDbId: string;
  hasKeyImages: boolean;
  keyImageCount?: number;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [marks, setMarks] = useState<KeyImageMark[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);

  useEffect(() => {
    if (!open || files !== null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/cases/${caseDbId}/key-images`).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ files: string[] }>;
      }),
      fetch(`/api/cases/${caseDbId}/key-images/annotations`).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{
          marks: KeyImageMark[];
          currentUserId?: string;
          isReviewer?: boolean;
        }>;
      }),
    ])
      .then(([fileData, annData]) => {
        if (cancelled) return;
        setFiles(fileData.files ?? []);
        if ((fileData.files ?? []).length > 0) setActive(fileData.files[0]!);
        setMarks(Array.isArray(annData.marks) ? annData.marks : []);
        setCurrentUserId(annData.currentUserId ?? null);
        setIsReviewer(annData.isReviewer === true);
      })
      .catch(() => {
        if (!cancelled) setError(t(lang, "case_key_images_load_error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, files, caseDbId, lang]);

  // Lock background scroll while the modal is open (stops case-list scrolling).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const blockWheel = (e: WheelEvent) => {
      const target = e.target as Node | null;
      const dialog = document.getElementById("key-images-modal-dialog");
      if (dialog && target && dialog.contains(target)) return;
      e.preventDefault();
    };
    window.addEventListener("wheel", blockWheel, { passive: false, capture: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.removeEventListener("wheel", blockWheel, true);
    };
  }, [open]);

  if (!hasKeyImages) return null;

  const countLabel = keyImageCount > 0 ? ` (${keyImageCount})` : "";
  const activeMarkCount = active ? marks.filter((m) => m.filename === active).length : 0;

  function close() {
    setOpen(false);
    setFiles(null);
    setActive(null);
    setError(null);
    setMarks([]);
  }

  return (
    <>
      <div className="md:col-span-2">
        <dt className="sr-only">{tk("case_key_images")}</dt>
        <dd className="m-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
          >
            <span className="text-[var(--muted)]">{tk("case_key_images")}</span>
            <span className="ml-2 font-medium text-[var(--accent)]">
              {tk("case_key_images_view")}
              {countLabel}
            </span>
          </button>
        </dd>
      </div>
      {open && (
        <KeyImageModalPortal>
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={tk("case_key_images")}
            onClick={close}
            onWheel={(e) => e.stopPropagation()}
          >
            <div
              id="key-images-modal-dialog"
              className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">{tk("case_key_images")}</h3>
                  {active && (
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {active}
                      {activeMarkCount > 0
                        ? ` · ${activeMarkCount} ${tk("case_key_image_marks_short")}`
                        : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
                >
                  {tk("drawer_close")}
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto overscroll-contain p-4">
                {loading && <p className="text-sm text-[var(--muted)]">{tk("ui_loading")}</p>}
                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
                {!loading && !error && files && files.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">{tk("case_key_images_empty")}</p>
                )}
                {!loading && files && files.length > 0 && active && (
                  <>
                    <KeyImageInteractiveViewer
                      lang={lang}
                      caseDbId={caseDbId}
                      filename={active}
                      marks={marks}
                      currentUserId={currentUserId}
                      canDeleteOthers={isReviewer}
                      onMarksChange={setMarks}
                    />
                    <div className="flex flex-wrap gap-2">
                      {files.map((name) => {
                        const count = marks.filter((m) => m.filename === name).length;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setActive(name)}
                            className={`relative overflow-hidden rounded-md border p-0.5 ${
                              active === name
                                ? "border-[var(--accent)]"
                                : "border-[var(--border)] hover:border-[var(--accent)]/50"
                            }`}
                            title={name}
                          >
                            <KeyImageView
                              src={`/api/cases/${caseDbId}/key-images/${encodeURIComponent(name)}`}
                              alt={name}
                              className="h-16 w-16"
                              mode="thumb"
                            />
                            {count > 0 && (
                              <span className="absolute right-0.5 top-0.5 rounded-full bg-[var(--danger)] px-1 text-[9px] font-bold leading-4 text-white">
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </KeyImageModalPortal>
      )}
    </>
  );
}
