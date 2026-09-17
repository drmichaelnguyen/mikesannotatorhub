"use client";

import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { tryYoutubeEmbedSrc, youtubeThumbnailUrl } from "@/lib/video-guides";

export function YoutubeThumbPlayer({
  lang,
  url,
  videoId,
  playing,
  onPlay,
  onCollapse,
  className = "",
}: {
  lang: Lang;
  url: string;
  videoId: string;
  playing: boolean;
  onPlay: () => void;
  onCollapse: () => void;
  className?: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const embed = tryYoutubeEmbedSrc(url, { autoplay: true });

  if (playing && embed) {
    return (
      <div
        className={`overflow-hidden rounded-md border border-[var(--accent)] bg-[var(--bg)] ${className}`}
      >
        <div className="aspect-video w-full bg-black">
          <iframe
            title={tk("case_video_embed_title")}
            className="h-full w-full"
            src={embed}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
          <button
            type="button"
            onClick={onCollapse}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            {tk("case_video_show_thumbnail")}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
          >
            {tk("case_video_open_link")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full max-w-[280px] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)] ${className}`}
    >
      <button
        type="button"
        onClick={onPlay}
        className="group relative block w-full text-left"
        aria-label={tk("case_video_play")}
        aria-pressed={playing}
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
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-md ring-1 ring-white/30 transition group-hover:scale-105 group-hover:bg-[var(--accent)]">
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
    </div>
  );
}
