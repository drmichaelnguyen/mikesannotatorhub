"use client";

import { useEffect, useRef, useState } from "react";
import { isTemporaryBlobImageSrc } from "@/lib/rich-text-images";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function RichTextContent({
  html,
  className = "",
  lang,
}: {
  html: string;
  className?: string;
  lang?: Lang;
}) {
  const tk = (k: DictKey) => (lang ? t(lang, k) : null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const brokenLabel =
    tk("rich_text_image_broken") ??
    "Image unavailable — re-upload using Paste or the Image button.";

  useEffect(() => {
    if (!lightboxSrc) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setLightboxSrc(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxSrc]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const cleanups: (() => void)[] = [];

    function replaceWithBrokenPlaceholder(img: HTMLImageElement) {
      if (img.dataset.richTextReplaced === "1") return;
      img.dataset.richTextReplaced = "1";
      const placeholder = document.createElement("div");
      placeholder.className =
        "my-3 rounded-md border border-dashed border-[var(--danger)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--danger)]";
      placeholder.textContent = brokenLabel;
      img.replaceWith(placeholder);
    }

    root.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";

      if (isTemporaryBlobImageSrc(src)) {
        replaceWithBrokenPlaceholder(img);
        return;
      }

      img.classList.add("cursor-zoom-in");
      const onError = () => replaceWithBrokenPlaceholder(img);
      const onClick = () => {
        if (img.dataset.richTextReplaced === "1") return;
        setLightboxSrc(src);
      };
      img.addEventListener("error", onError);
      img.addEventListener("click", onClick);
      cleanups.push(() => {
        img.removeEventListener("error", onError);
        img.removeEventListener("click", onClick);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [html, brokenLabel]);

  return (
    <>
      <div
        ref={containerRef}
        className={`rich-text-content prose prose-sm max-w-none text-[var(--text)] prose-headings:font-semibold prose-p:my-2 prose-img:my-3 prose-img:max-w-full prose-img:rounded-md ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-label={tk("discussion_expand_image") ?? "View full image"}
          onClick={() => setLightboxSrc(null)}
        >
          <div
            className="max-h-[90vh] max-w-[min(96vw,56rem)] cursor-default overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="" className="max-h-[85vh] w-auto max-w-full object-contain" />
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
              onClick={() => setLightboxSrc(null)}
            >
              {tk("drawer_close") ?? "Close"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
