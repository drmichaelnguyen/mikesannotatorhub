"use client";

import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import {
  tryYoutubeEmbedSrc,
  tryYoutubeVideoId,
  youtubeThumbnailUrl,
} from "@/lib/video-guides";
import { useState } from "react";

export function CaseVideoGuidesSection({ lang, urls }: { lang: Lang; urls: string[] }) {
  const tk = (k: DictKey) => t(lang, k);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  if (urls.length === 0) return null;

  const playingUrl = playingIndex != null ? urls[playingIndex] : null;
  const playingId = playingUrl ? tryYoutubeVideoId(playingUrl) : null;
  const playingEmbed =
    playingUrl && playingId ? tryYoutubeEmbedSrc(playingUrl, { autoplay: true }) : null;

  return (
    <div className="md:col-span-2">
      <dt className="text-[var(--muted)]">{tk("case_videos")}</dt>
      <dd className="mt-2 space-y-3">
        {playingUrl && playingEmbed && (
          <div className="overflow-hidden rounded-md border border-[var(--accent)] bg-[var(--bg)]">
            <div className="aspect-video w-full bg-black">
              <iframe
                key={playingIndex}
                title={tk("case_video_embed_title")}
                className="h-full w-full"
                src={playingEmbed}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => setPlayingIndex(null)}
                className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                {tk("case_video_show_thumbnail")}
              </button>
              <a
                href={playingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
              >
                {tk("case_video_open_link")}
              </a>
            </div>
          </div>
        )}
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 md:grid-cols-4">
          {urls.map((url, i) => {
            const videoId = tryYoutubeVideoId(url);
            const isActive = playingIndex === i;
            if (!videoId) {
              return (
                <li
                  key={`${i}-${url.slice(0, 48)}`}
                  className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
                >
                  <div className="break-all px-2 py-1.5 text-xs">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
                    >
                      {url}
                    </a>
                  </div>
                </li>
              );
            }
            return (
              <li
                key={`${i}-${url.slice(0, 48)}`}
                className={`overflow-hidden rounded-md border bg-[var(--bg)] ${
                  isActive ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPlayingIndex(i)}
                  className="group relative block w-full text-left"
                  aria-label={tk("case_video_play")}
                  aria-pressed={isActive}
                >
                  <div className="aspect-video w-full bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={youtubeThumbnailUrl(videoId)}
                      alt=""
                      className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                      loading="lazy"
                    />
                  </div>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md ring-1 ring-white/30 transition group-hover:scale-105 ${
                        isActive ? "bg-[var(--accent)]" : "bg-black/70 group-hover:bg-[var(--accent)]"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                </button>
                <div className="break-all px-2 py-1.5 text-xs">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tk("case_video_open_link")}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </dd>
    </div>
  );
}
