"use client";

import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { tryYoutubeEmbedSrc } from "@/lib/video-guides";

export function CaseVideoGuidesSection({ lang, urls }: { lang: Lang; urls: string[] }) {
  const tk = (k: DictKey) => t(lang, k);
  if (urls.length === 0) return null;
  return (
    <div className="md:col-span-2">
      <dt className="text-[var(--muted)]">{tk("case_videos")}</dt>
      <dd className="mt-2">
      <ul className="m-0 list-none space-y-3 p-0">
        {urls.map((url, i) => {
          const embed = tryYoutubeEmbedSrc(url);
          return (
            <li
              key={`${i}-${url.slice(0, 48)}`}
              className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
            >
              {embed ? (
                <>
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      title={tk("case_video_embed_title")}
                      className="h-full w-full"
                      src={embed}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div className="break-all px-3 py-2 text-sm">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
                    >
                      {tk("case_video_open_link")}
                    </a>
                  </div>
                </>
              ) : (
                <div className="break-all px-3 py-2 text-sm">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
                  >
                    {url}
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </dd>
    </div>
  );
}
