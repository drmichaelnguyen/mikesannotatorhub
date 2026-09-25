import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import {
  isKeyImageFilename,
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
 * Parse folder uploads. Prefer `file.name` when it carries a relative path
 * (set via FormData append third arg); fall back to webkitRelativePath.
 */
export async function parseKeyImageUploads(
  files: File[],
  caseIds: string[],
  existingNamesByCase?: Map<string, Set<string>>,
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

  for (const file of files) {
    const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relativePath =
      (typeof webkitPath === "string" && webkitPath.trim() ? webkitPath : file.name) || file.name;

    if (!isKeyImageFilename(relativePath)) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    if (file.size > KEY_IMAGE_MAX_FILE_BYTES) {
      unmatchedPaths.push(`${relativePath} (too large)`);
      continue;
    }

    const caseId = matchKeyImagePathToCaseId(relativePath, caseIds);
    if (!caseId) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    let basename = sanitizeKeyImageBasename(relativePath);
    const used = usedNamesByCase.get(caseId) ?? new Set<string>();
    if (used.has(basename.toLowerCase())) {
      const ext = path.extname(basename);
      const stem = basename.slice(0, basename.length - ext.length) || "image";
      let i = 2;
      while (used.has(`${stem}_${i}${ext}`.toLowerCase())) i += 1;
      basename = `${stem}_${i}${ext}`;
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
  const { matched, unmatchedPaths } = await parseKeyImageUploads(
    files,
    caseIds,
    existingNamesByCase,
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
    default:
      return "application/octet-stream";
  }
}
