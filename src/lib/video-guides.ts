/** Parsed from forms as one URL per line; stored on AnnotationCase as JSON string array. */

export const MAX_VIDEO_GUIDE_URLS = 20;
export const MAX_VIDEO_GUIDE_URL_LENGTH = 2048;

export function parseVideoGuideUrlsInput(raw: string): string[] {
  const lines = raw
    .split(/[\r\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const slice = line.length > MAX_VIDEO_GUIDE_URL_LENGTH ? line.slice(0, MAX_VIDEO_GUIDE_URL_LENGTH) : line;
    if (seen.has(slice)) continue;
    seen.add(slice);
    out.push(slice);
    if (out.length >= MAX_VIDEO_GUIDE_URLS) break;
  }
  return out;
}

function normalizeParsedArray(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const x of parsed) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    out.push(s.length > MAX_VIDEO_GUIDE_URL_LENGTH ? s.slice(0, MAX_VIDEO_GUIDE_URL_LENGTH) : s);
    if (out.length >= MAX_VIDEO_GUIDE_URLS) break;
  }
  return out;
}

/** Reads Prisma `String` column (JSON text) or legacy parsed JSON array. */
export function videoGuideUrlsFromDb(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return normalizeParsedArray(value);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      return normalizeParsedArray(JSON.parse(s));
    } catch {
      return [];
    }
  }
  return [];
}

export function videoGuideUrlsToDbColumn(urls: string[]): string {
  return JSON.stringify(urls);
}

/** Returns YouTube video id for watch / short / youtu.be / embed URLs, or null. */
export function tryYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "www.youtube.com") {
      if (u.pathname === "/watch") {
        return u.searchParams.get("v");
      }
      const m = u.pathname.match(/^\/embed\/([^/?]+)/);
      if (m?.[1]) return m[1];
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts?.[1]) return shorts[1];
    }
  } catch {
    return null;
  }
  return null;
}

/** Returns embed src for YouTube watch / short / youtu.be URLs, or null. */
export function tryYoutubeEmbedSrc(url: string, opts?: { autoplay?: boolean }): string | null {
  const id = tryYoutubeVideoId(url);
  if (!id) return null;
  const q = opts?.autoplay ? "?autoplay=1" : "";
  return `https://www.youtube-nocookie.com/embed/${id}${q}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Match http(s) URLs in free text (stops at whitespace / common wrappers). */
const HTTP_URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'`]+/gi;

function stripTrailingUrlPunctuation(raw: string): { url: string; matchedLength: number } {
  let end = raw.length;
  while (end > 0 && /[.,;:!?)\]\}'"]/.test(raw[end - 1]!)) {
    end -= 1;
  }
  return { url: raw.slice(0, end), matchedLength: raw.length };
}

export type TextYoutubePart =
  | { type: "text"; value: string }
  | { type: "youtube"; url: string; videoId: string };

/** Split free text into plain segments and YouTube URL segments for in-app embeds. */
export function splitTextWithYoutubeUrls(text: string): TextYoutubePart[] {
  if (!text) return [];
  const parts: TextYoutubePart[] = [];
  const re = new RegExp(HTTP_URL_IN_TEXT_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const { url, matchedLength } = stripTrailingUrlPunctuation(raw);
    const start = m.index;
    if (start > last) {
      parts.push({ type: "text", value: text.slice(last, start) });
    }
    const videoId = url ? tryYoutubeVideoId(url) : null;
    if (videoId && url) {
      parts.push({ type: "youtube", url, videoId });
      const trailing = raw.slice(url.length);
      if (trailing) parts.push({ type: "text", value: trailing });
    } else {
      parts.push({ type: "text", value: raw });
    }
    last = start + matchedLength;
  }
  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
