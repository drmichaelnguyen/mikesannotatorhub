"use client";

import { useEffect, useState } from "react";
import { KeyImageView } from "@/components/KeyImageView";
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

  useEffect(() => {
    if (!open || files !== null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cases/${caseDbId}/key-images`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ files: string[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setFiles(data.files ?? []);
        if ((data.files ?? []).length > 0) setActive(data.files[0]!);
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

  if (!hasKeyImages) return null;

  const countLabel = keyImageCount > 0 ? ` (${keyImageCount})` : "";

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tk("case_key_images")}
          onClick={() => {
            setOpen(false);
            setFiles(null);
            setActive(null);
            setError(null);
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold">{tk("case_key_images")}</h3>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setFiles(null);
                  setActive(null);
                  setError(null);
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
              >
                {tk("drawer_close")}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
              {loading && <p className="text-sm text-[var(--muted)]">{tk("ui_loading")}</p>}
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              {!loading && !error && files && files.length === 0 && (
                <p className="text-sm text-[var(--muted)]">{tk("case_key_images_empty")}</p>
              )}
              {!loading && files && files.length > 0 && (
                <>
                  {active && (
                    <div className="flex min-h-[40vh] items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
                      <KeyImageView
                        src={`/api/cases/${caseDbId}/key-images/${encodeURIComponent(active)}`}
                        alt={active}
                        className="max-h-[60vh] max-w-full"
                        mode="full"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {files.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setActive(name)}
                        className={`overflow-hidden rounded-md border p-0.5 ${
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
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
