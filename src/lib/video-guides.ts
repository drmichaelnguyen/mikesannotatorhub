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

export function videoGuideUrlsFromDb(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const x of value) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    out.push(s.length > MAX_VIDEO_GUIDE_URL_LENGTH ? s.slice(0, MAX_VIDEO_GUIDE_URL_LENGTH) : s);
    if (out.length >= MAX_VIDEO_GUIDE_URLS) break;
  }
  return out;
}

/** Returns embed src for YouTube watch / short / youtu.be URLs, or null. */
export function tryYoutubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "www.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      const m = u.pathname.match(/^\/embed\/([^/?]+)/);
      if (m?.[1]) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts?.[1]) return `https://www.youtube-nocookie.com/embed/${shorts[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}
