import { normalizeStudyId } from "@/lib/radiologist-findings";

/** Common raster + DICOM extensions. */
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|tif{1,2}|dcm|dicom|ima|img)$/i;

/** Extensions we never treat as key images. */
const REJECT_EXT_RE =
  /\.(txt|html?|css|js|mjs|ts|tsx|json|xml|csv|tsv|xlsx?|docx?|pptx?|pdf|zip|rar|7z|gz|tar|exe|dll|dmg|iso|ds_store|ini|log|md|nfo|plist|db|sqlite|bak|tmp|url|lnk)$/i;

/** Soft per-file cap to avoid OOM while decoding a single image. */
export const KEY_IMAGE_MAX_FILE_BYTES = 30 * 1024 * 1024;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const MIN_SUBSTRING_MATCH_LEN = 6;

/** True when the path looks like a standard key-image extension. */
export function isKeyImageFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  return IMAGE_EXT_RE.test(base);
}

/** True when the filename is a DICOM object (.dcm / .dicom). */
export function isDicomFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  return /\.(dcm|dicom)$/i.test(base);
}

/** Obvious non-image documents / junk to skip in folder uploads. */
export function isRejectedKeyImageFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  if (!base || base === "." || base === "..") return true;
  if (base.startsWith(".")) return true; // .DS_Store, Thumbs.db-style
  return REJECT_EXT_RE.test(base);
}

/**
 * Files we will upload when their path matches a study ID:
 * known image/DICOM extensions, extensionless names (common DICOM exports),
 * or unknown extensions that are not rejected junk.
 */
export function isPlausibleKeyImageFile(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  if (!base) return false;
  if (isRejectedKeyImageFilename(base)) return false;
  if (isKeyImageFilename(base)) return true;
  // Extensionless (IM0001, 1, SOPInstanceUID, …)
  if (!/\.[a-z0-9]{1,8}$/i.test(base)) return true;
  // Unknown short extension under a matched study folder (e.g. .dic)
  return true;
}

/**
 * Match a folder-upload relative path to a case/study ID.
 * Checks nested folder segments (deepest first), embedded UUIDs, asi- prefix,
 * underscore/hyphen variants, and substring containment for longer IDs.
 */
export function matchKeyImagePathToCaseId(
  relativePath: string,
  caseIds: Iterable<string>,
): string | null {
  const caseIdList = [...caseIds].map((id) => id.trim()).filter(Boolean);
  if (caseIdList.length === 0) return null;

  const parts = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const indexes = buildCaseIdIndexes(caseIdList);

  // Prefer parent folders over the filename itself; then try the filename.
  const folderCandidates =
    parts.length >= 2 ? [...parts.slice(0, -1)].reverse() : [];
  const fileCandidate = parts[parts.length - 1]!;
  const candidates = [...folderCandidates, fileCandidate];

  for (const segment of candidates) {
    const match = matchSegmentToCaseId(segment, indexes);
    if (match) return match;
  }

  // Last resort: any UUID anywhere in the full relative path.
  const pathLower = relativePath.replace(/\\/g, "/");
  for (const uuidMatch of pathLower.matchAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  )) {
    const viaUuid = indexes.byNorm.get(normalizeStudyId(uuidMatch[0]!));
    if (viaUuid) return viaUuid;
  }

  // Substring containment across the full path for longer case IDs.
  for (const caseId of caseIdList) {
    if (caseId.length < MIN_SUBSTRING_MATCH_LEN) continue;
    if (pathLower.toLowerCase().includes(caseId.toLowerCase())) return caseId;
    const norm = normalizeStudyId(caseId);
    if (norm.length >= MIN_SUBSTRING_MATCH_LEN && pathLower.toLowerCase().includes(norm)) {
      return caseId;
    }
  }

  return null;
}

type CaseIdIndexes = {
  byExact: Map<string, string>;
  byNorm: Map<string, string>;
  caseIds: string[];
};

function buildCaseIdIndexes(caseIds: string[]): CaseIdIndexes {
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const caseId of caseIds) {
    byExact.set(caseId, caseId);
    byExact.set(caseId.toLowerCase(), caseId);
    const norm = normalizeStudyId(caseId);
    if (!byNorm.has(norm)) byNorm.set(norm, caseId);
    // Also index hyphen/underscore swaps of the stored id.
    const swapped = caseId.replace(/_/g, "-");
    byExact.set(swapped.toLowerCase(), caseId);
    const swappedNorm = normalizeStudyId(swapped);
    if (!byNorm.has(swappedNorm)) byNorm.set(swappedNorm, caseId);
  }
  return { byExact, byNorm, caseIds };
}

function matchSegmentToCaseId(
  segment: string,
  indexes: CaseIdIndexes,
): string | null {
  const variants = new Set<string>();
  const trimmed = segment.trim();
  if (!trimmed) return null;
  variants.add(trimmed);
  variants.add(trimmed.replace(/_/g, "-"));
  variants.add(trimmed.replace(/-/g, "_"));
  // Flat files: strip known image/DICOM extensions
  const withoutExt = trimmed.replace(IMAGE_EXT_RE, "").trim();
  if (withoutExt && withoutExt !== trimmed) {
    variants.add(withoutExt);
    variants.add(withoutExt.replace(/_/g, "-"));
  }
  // Optional asi- prefix variants
  for (const v of [...variants]) {
    if (/^asi-/i.test(v)) variants.add(v.slice(4));
    else if (UUID_RE.test(v)) variants.add(`asi-${v}`);
  }

  for (const candidate of variants) {
    const exact =
      indexes.byExact.get(candidate) ?? indexes.byExact.get(candidate.toLowerCase());
    if (exact) return exact;

    const viaNorm = indexes.byNorm.get(normalizeStudyId(candidate));
    if (viaNorm) return viaNorm;

    const uuidMatch = candidate.match(UUID_RE);
    if (uuidMatch?.[0]) {
      const viaUuid = indexes.byNorm.get(normalizeStudyId(uuidMatch[0]));
      if (viaUuid) return viaUuid;
    }
  }

  // Segment contains a long case id / normalized uuid (e.g. Study_asi-xxx_CT)
  const lower = trimmed.toLowerCase();
  for (const caseId of indexes.caseIds) {
    if (caseId.length < MIN_SUBSTRING_MATCH_LEN) continue;
    if (lower.includes(caseId.toLowerCase())) return caseId;
    const norm = normalizeStudyId(caseId);
    if (norm.length >= MIN_SUBSTRING_MATCH_LEN && lower.includes(norm)) return caseId;
  }

  return null;
}

/** Sanitize a stored filename (no path separators). */
export function sanitizeKeyImageBasename(filename: string): string {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").replace(/^\.+/, "");
  return cleaned || "image";
}

/** DICOM Part 10 files have "DICM" at byte offset 128. */
export function looksLikeDicomBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 132) return false;
  return (
    bytes[128] === 0x44 &&
    bytes[129] === 0x49 &&
    bytes[130] === 0x43 &&
    bytes[131] === 0x4d
  );
}
