/** Prevents open redirects: only same-origin app paths allowed. */
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes("://")) return null;
  if (next.startsWith("/login")) return null;
  if (
    next === "/" ||
    next.startsWith("/reviewer") ||
    next.startsWith("/annotator")
  ) {
    return next;
  }
  return null;
}
