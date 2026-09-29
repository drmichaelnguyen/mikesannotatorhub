import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import {
  isKeyImageFilename,
  isPlausibleKeyImageFile,
  isRejectedKeyImageFilename,
  matchKeyImagePathToCaseId,
  sanitizeKeyImageBasename,
  KEY_IMAGE_MAX_FILE_BYTES,
} from "@/lib/key-image-path";

export {
  isKeyImageFilename,
  matchKeyImagePathToCaseId,
  sanitizeKeyImageBasename,
  KEY_IMAGE_MAX_FILE_BYTES,
};

const KEY_IMAGES_DIR = path.join(process.cwd(), "uploads", "key-images");

function caseDir(caseDbId: string) {
  return path.join(KEY_IMAGES_DIR, caseDbId);
}

export async function ensureKeyImagesDir(caseDbId?: string) {
  await mkdir(caseDbId ? caseDir(caseDbId) : KEY_IMAGES_DIR, { recursive: true });
}

export type ParsedKeyImageUpload = {
  caseId: string;
  filename: string;
  relativePath: string;
  bytes: Buffer;
};

/**
 * Parse folder uploads. Prefer explicit relative paths / case IDs from FormData
 * (browsers strip folder paths from File.name). Fall back to webkitRelativePath,
 * then file.name.
 */
export async function parseKeyImageUploads(
  files: File[],
  caseIds: string[],
  existingNamesByCase?: Map<string, Set<string>>,
  hints?: {
    relativePaths?: string[];
    caseIdsPerFile?: string[];
  },
): Promise<{
  matched: ParsedKeyImageUpload[];
  unmatchedPaths: string[];
}> {
  const matched: ParsedKeyImageUpload[] = [];
  const unmatchedPaths: string[] = [];
  const usedNamesByCase = new Map<string, Set<string>>();
  if (existingNamesByCase) {
    for (const [caseId, names] of existingNamesByCase) {
      usedNamesByCase.set(caseId, new Set(names));
    }
  }

  const allowed = new Set(caseIds);
  const byNorm = new Map<string, string>();
  for (const caseId of caseIds) {
    const norm = caseId.trim().toLowerCase().replace(/^asi-/, "");
    if (!byNorm.has(norm)) byNorm.set(norm, caseId);
  }

  function resolveHintedCaseId(raw: string | undefined): string | null {
    const hinted = raw?.trim() || "";
    if (!hinted) return null;
    if (allowed.has(hinted)) return hinted;
    const viaNorm = byNorm.get(hinted.toLowerCase().replace(/^asi-/, ""));
    return viaNorm && allowed.has(viaNorm) ? viaNorm : null;
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const hintedPath = hints?.relativePaths?.[i]?.trim() || "";
    const relativePath =
      hintedPath ||
      (typeof webkitPath === "string" && webkitPath.trim() ? webkitPath : "") ||
      file.name ||
      `file-${i}`;

    if (isRejectedKeyImageFilename(relativePath) || isRejectedKeyImageFilename(file.name)) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    if (file.size > KEY_IMAGE_MAX_FILE_BYTES) {
      unmatchedPaths.push(`${relativePath} (too large)`);
      continue;
    }

    const caseId =
      resolveHintedCaseId(hints?.caseIdsPerFile?.[i]) ||
      matchKeyImagePathToCaseId(relativePath, caseIds) ||
      matchKeyImagePathToCaseId(file.name, caseIds);
    if (!caseId) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    // Under a matched study folder, allow known images and extensionless DICOM-style files.
    if (
      !isKeyImageFilename(relativePath) &&
      !isKeyImageFilename(file.name) &&
      !isPlausibleKeyImageFile(relativePath)
    ) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    let basename = sanitizeKeyImageBasename(relativePath || file.name);
    const hasKnownExt = isKeyImageFilename(basename);
    if (!hasKnownExt) {
      // Extensionless / unknown: store as .dcm so the viewer can render DICOM.
      const stem = basename.replace(/\.[^.]+$/, "") || "image";
      basename = `${stem}.dcm`;
    }
    const used = usedNamesByCase.get(caseId) ?? new Set<string>();
    if (used.has(basename.toLowerCase())) {
      const ext = path.extname(basename);
      const stem = basename.slice(0, basename.length - ext.length) || "image";
      let n = 2;
      while (used.has(`${stem}_${n}${ext}`.toLowerCase())) n += 1;
      basename = `${stem}_${n}${ext}`;
    }
    used.add(basename.toLowerCase());
    usedNamesByCase.set(caseId, used);

    matched.push({ caseId, filename: basename, relativePath, bytes });
  }

  return { matched, unmatchedPaths };
}

export async function saveKeyImagesForCase(
  caseDbId: string,
  images: { filename: string; bytes: Buffer }[],
  options: { replace?: boolean } = {},
): Promise<number> {
  const replace = options.replace ?? true;
  if (images.length === 0 && !replace) {
    return (await listKeyImages(caseDbId)).length;
  }
  const dir = caseDir(caseDbId);
  if (replace) {
    await rm(dir, { recursive: true, force: true });
  }
  await ensureKeyImagesDir(caseDbId);
  for (const image of images) {
    await writeFile(path.join(dir, image.filename), image.bytes);
  }
  return (await listKeyImages(caseDbId)).length;
}

export async function listKeyImages(caseDbId: string): Promise<string[]> {
  try {
    const entries = await readdir(caseDir(caseDbId));
    return entries.filter((name) => isKeyImageFilename(name)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function readKeyImage(
  caseDbId: string,
  filename: string,
): Promise<Buffer | null> {
  const base = sanitizeKeyImageBasename(filename);
  if (!isKeyImageFilename(base)) return null;
  if (base.includes("..") || base.includes("/") || base.includes("\\")) return null;
  try {
    return await readFile(path.join(caseDir(caseDbId), base));
  } catch {
    return null;
  }
}

export async function deleteKeyImages(caseDbId: string) {
  try {
    await rm(caseDir(caseDbId), { recursive: true, force: true });
  } catch {
    // Directory may already be missing.
  }
}

export async function readKeyImagesFromFormData(
  formData: FormData,
  caseIds: string[],
  existingNamesByCase?: Map<string, Set<string>>,
): Promise<{
  byCaseId: Map<string, { filename: string; bytes: Buffer }[]>;
  unmatchedPaths: string[];
  matchedCaseCount: number;
  matchedFileCount: number;
}> {
  const files = formData
    .getAll("keyImages")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const relativePaths = formData.getAll("keyImagePaths").map((entry) => String(entry ?? ""));
  const caseIdsPerFile = formData.getAll("keyImageCaseIds").map((entry) => String(entry ?? ""));
  const { matched, unmatchedPaths } = await parseKeyImageUploads(
    files,
    caseIds,
    existingNamesByCase,
    {
      relativePaths: relativePaths.length > 0 ? relativePaths : undefined,
      caseIdsPerFile: caseIdsPerFile.length > 0 ? caseIdsPerFile : undefined,
    },
  );
  const byCaseId = new Map<string, { filename: string; bytes: Buffer }[]>();
  for (const row of matched) {
    const list = byCaseId.get(row.caseId) ?? [];
    list.push({ filename: row.filename, bytes: row.bytes });
    byCaseId.set(row.caseId, list);
  }
  return {
    byCaseId,
    unmatchedPaths,
    matchedCaseCount: byCaseId.size,
    matchedFileCount: matched.length,
  };
}

export function keyImageContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".dcm":
    case ".dicom":
      return "application/dicom";
    default:
      return "application/octet-stream";
  }
}
