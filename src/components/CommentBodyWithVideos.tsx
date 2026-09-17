"use client";

import { YoutubeThumbPlayer } from "@/components/YoutubeThumbPlayer";
import type { Lang } from "@/lib/i18n";
import { splitTextWithYoutubeUrls } from "@/lib/video-guides";
import { useMemo, useState } from "react";

/** Renders comment/discussion body text with YouTube links as playable thumbnails. */
export function CommentBodyWithVideos({
  lang,
  text,
  className = "",
}: {
  lang: Lang;
  text: string;
  className?: string;
}) {
  const parts = useMemo(() => splitTextWithYoutubeUrls(text), [text]);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const hasYoutube = parts.some((p) => p.type === "youtube");
  if (!hasYoutube) {
    return <p className={`whitespace-pre-wrap text-[var(--text)] ${className}`}>{text}</p>;
  }

  return (
    <div className={`text-[var(--text)] ${className}`}>
      {parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.value) return null;
          return (
            <span key={`t-${i}`} className="whitespace-pre-wrap">
              {part.value}
            </span>
          );
        }
        const key = `yt-${i}-${part.videoId}`;
        const playing = playingKey === key;
        return (
          <div key={key} className="my-2 block">
            <YoutubeThumbPlayer
              lang={lang}
              url={part.url}
              videoId={part.videoId}
              playing={playing}
              onPlay={() => setPlayingKey(key)}
              onCollapse={() => setPlayingKey(null)}
              className={playing ? "max-w-none" : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
