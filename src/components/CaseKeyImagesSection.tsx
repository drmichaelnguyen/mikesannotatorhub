"use client";

import { useEffect, useState } from "react";
import { KeyImageInteractiveViewer } from "@/components/KeyImageInteractiveViewer";
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
  const [files, setFiles] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [marks, setMarks] = useState<KeyImageMark[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReviewer, setIsReviewer] = useState(false);

  useEffect(() => {
    if (!hasKeyImages) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFiles(null);
    setActive(null);
    setMarks([]);
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
        const nextFiles = fileData.files ?? [];
        setFiles(nextFiles);
        if (nextFiles.length > 0) setActive(nextFiles[0]!);
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
  }, [hasKeyImages, caseDbId, lang]);

  if (!hasKeyImages) {
    return <p className="text-sm text-[var(--muted)]">{tk("case_key_images_empty")}</p>;
  }

  const activeMarkCount = active ? marks.filter((m) => m.filename === active).length : 0;
  const countLabel = keyImageCount > 0 ? ` (${keyImageCount})` : "";

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        {tk("case_key_images")}
        {countLabel}
        {active
          ? ` · ${active}${
              activeMarkCount > 0 ? ` · ${activeMarkCount} ${tk("case_key_image_marks_short")}` : ""
            }`
          : ""}
      </p>
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
  );
}
