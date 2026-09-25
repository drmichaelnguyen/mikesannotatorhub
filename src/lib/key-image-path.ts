import { normalizeStudyId } from "@/lib/radiologist-findings";

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|tif{1,2})$/i;

/** Soft per-file cap to avoid OOM while decoding a single image. */
export const KEY_IMAGE_MAX_FILE_BYTES = 30 * 1024 * 1024;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** True when the path looks like a raster image we can serve as a key image. */
export function isKeyImageFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  return IMAGE_EXT_RE.test(base);
}

/**
 * Match a folder-upload relative path to a case/study ID.
 * Prefers the immediate parent folder of the file, then other path segments
 * (deepest first). Supports optional `asi-` prefix and embedded UUIDs.
 */
export function matchKeyImagePathToCaseId(
  relativePath: string,
  caseIds: Iterable<string>,
): string | null {
  const parts = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  // Prefer parent folders over the filename itself.
  const candidates =
    parts.length >= 2 ? [...parts.slice(0, -1)].reverse() : [parts[0]!];

  for (const segment of candidates) {
    const match = matchSegmentToCaseId(segment, caseIds);
    if (match) return match;
  }
  return null;
}

function matchSegmentToCaseId(
  segment: string,
  caseIds: Iterable<string>,
): string | null {
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const caseId of caseIds) {
    byExact.set(caseId, caseId);
    byExact.set(caseId.toLowerCase(), caseId);
    const norm = normalizeStudyId(caseId);
    if (!byNorm.has(norm)) byNorm.set(norm, caseId);
  }

  const trimmed = segment.trim();
  if (!trimmed) return null;

  const exact = byExact.get(trimmed) ?? byExact.get(trimmed.toLowerCase());
  if (exact) return exact;

  const viaNorm = byNorm.get(normalizeStudyId(trimmed));
  if (viaNorm) return viaNorm;

  const uuidMatch = trimmed.match(UUID_RE);
  if (uuidMatch?.[0]) {
    const viaUuid = byNorm.get(normalizeStudyId(uuidMatch[0]));
    if (viaUuid) return viaUuid;
  }

  return null;
}

/** Sanitize a stored filename (no path separators). */
export function sanitizeKeyImageBasename(filename: string): string {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").replace(/^\.+/, "");
  return cleaned || "image";
}
