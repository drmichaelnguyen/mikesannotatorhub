import { matchContinuityReportFileToCaseId } from "@/lib/continuity-report-filename";
import {
  isKeyImageFilename,
  isPlausibleKeyImageFile,
  isRejectedKeyImageFilename,
  KEY_IMAGE_MAX_FILE_BYTES,
  matchKeyImagePathToCaseId,
  sanitizeKeyImageBasename,
} from "@/lib/key-image-path";

/** Target size per chunk request (keeps server memory and body limit safe). */
export const KEY_IMAGE_CHUNK_BYTES = 2 * 1024 * 1024;
export const KEY_IMAGE_CHUNK_MAX_FILES = 4;
/** Prefer at most this many study IDs per chunk when packing folders. */
export const KEY_IMAGE_CHUNK_MAX_STUDIES = 1;
/** Overall folder cap across all chunks. */
export const KEY_IMAGE_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;
/** Continuity reports also upload in chunks (same request budget as key images). */
export const CONTINUITY_CHUNK_BYTES = KEY_IMAGE_CHUNK_BYTES;
export const CONTINUITY_CHUNK_MAX_FILES = 20;
export const CONTINUITY_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;

export type KeyImageUploadProgress = {
  percent: number;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  chunkIndex: number;
  chunkCount: number;
};

export type KeyImageChunkUploadResult =
  | {
      ok: true;
      matchedCaseIds: string[];
      matchedFileCount: number;
      unmatchedPaths: string[];
    }
  | {
      ok: false;
      error: string;
      referenceId?: string;
    };

export type KeyImageChunkUploader = (
  formData: FormData,
  meta: {
    clearCaseIds: string[];
    caseIds: string[];
    caseDbIds?: string[];
    scopeOfWork?: string;
    redbrickProject?: string;
  },
) => Promise<KeyImageChunkUploadResult>;

export type ContinuityChunkUploadResult =
  | {
      ok: true;
      matchedCaseIds: string[];
      unmatchedFilenames: string[];
    }
  | {
      ok: false;
      error: string;
      referenceId?: string;
    };

export type ContinuityChunkUploader = (
  formData: FormData,
  meta: {
    caseIds: string[];
    caseDbIds?: string[];
    scopeOfWork?: string;
    redbrickProject?: string;
  },
) => Promise<ContinuityChunkUploadResult>;

function fileRelativePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function filterKeyImageFiles(files: File[]): {
  accepted: File[];
  skipped: string[];
  totalBytes: number;
} {
  const accepted: File[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const relativePath = fileRelativePath(file);
    const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
    const extensionless = !/\.[a-z0-9]{1,8}$/i.test(base);
    // Strict prefilter: known image/DICOM extensions, or extensionless (common DICOM).
    if (!isKeyImageFilename(relativePath) && !extensionless) {
      skipped.push(relativePath);
      continue;
    }
    if (isRejectedKeyImageFilename(relativePath)) {
      skipped.push(relativePath);
      continue;
    }
    if (file.size <= 0) {
      skipped.push(relativePath);
      continue;
    }
    if (file.size > KEY_IMAGE_MAX_FILE_BYTES) {
      skipped.push(`${relativePath} (too large)`);
      continue;
    }
    if (totalBytes + file.size > KEY_IMAGE_MAX_TOTAL_BYTES) {
      skipped.push(`${relativePath} (folder over limit)`);
      continue;
    }
    accepted.push(file);
    totalBytes += file.size;
  }
  return { accepted, skipped, totalBytes };
}

/**
 * Client-side study-ID matching before any upload.
 * Matches nested folder names first, then accepts images/DICOM (including
 * extensionless DICOM files) only under those matched study folders.
 */
export function analyzeKeyImageMatches(
  files: File[],
  caseIds: string[],
): {
  matchedFiles: File[];
  matchedByCaseId: Map<string, File[]>;
  unmatchedPaths: string[];
  matchedCaseIds: string[];
  totalMatchedBytes: number;
} {
  const matchedByCaseId = new Map<string, File[]>();
  const unmatchedPaths: string[] = [];
  let totalMatchedBytes = 0;
  let runningBytes = 0;

  for (const file of files) {
    const relativePath = fileRelativePath(file);
    if (file.size <= 0) {
      unmatchedPaths.push(relativePath);
      continue;
    }
    if (isRejectedKeyImageFilename(relativePath)) {
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

    // Path matched a study ID — accept known images and extensionless DICOM-style files.
    if (!isPlausibleKeyImageFile(relativePath)) {
      unmatchedPaths.push(relativePath);
      continue;
    }

    if (runningBytes + file.size > KEY_IMAGE_MAX_TOTAL_BYTES) {
      unmatchedPaths.push(`${relativePath} (folder over limit)`);
      continue;
    }

    const list = matchedByCaseId.get(caseId) ?? [];
    list.push(file);
    matchedByCaseId.set(caseId, list);
    totalMatchedBytes += file.size;
    runningBytes += file.size;
  }

  return {
    matchedFiles: [...matchedByCaseId.values()].flat(),
    matchedByCaseId,
    unmatchedPaths,
    matchedCaseIds: [...matchedByCaseId.keys()],
    totalMatchedBytes,
  };
}

export function filterContinuityFiles(files: File[]): {
  accepted: File[];
  skipped: string[];
  totalBytes: number;
} {
  const accepted: File[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (file.size <= 0) {
      skipped.push(file.name);
      continue;
    }
    if (totalBytes + file.size > CONTINUITY_MAX_TOTAL_BYTES) {
      skipped.push(`${file.name} (folder over limit)`);
      continue;
    }
    accepted.push(file);
    totalBytes += file.size;
  }
  return { accepted, skipped, totalBytes };
}

/**
 * Group key-image files by matched study/case ID (unmatched keep their own bucket).
 */
export function groupKeyImageFilesByStudyId(
  files: File[],
  caseIds: string[],
): Map<string, File[]> {
  const byStudy = new Map<string, File[]>();
  for (const file of files) {
    const relativePath = fileRelativePath(file);
    const studyId =
      matchKeyImagePathToCaseId(relativePath, caseIds) ?? `__unmatched__:${relativePath}`;
    const list = byStudy.get(studyId) ?? [];
    list.push(file);
    byStudy.set(studyId, list);
  }
  return byStudy;
}

function packFileGroupsIntoChunks(
  groups: File[][],
  maxBytes: number,
  maxFiles: number,
  maxGroupsPerChunk: number,
): File[][] {
  const chunks: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  let currentGroups = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current);
    current = [];
    currentBytes = 0;
    currentGroups = 0;
  };

  for (const group of groups) {
    let groupBytes = 0;
    let groupFiles: File[] = [];

    for (const file of group) {
      const wouldExceedBytes =
        groupFiles.length > 0 && groupBytes + file.size > maxBytes;
      const wouldExceedCount = groupFiles.length >= maxFiles;
      if (wouldExceedBytes || wouldExceedCount) {
        const fitsInCurrent =
          current.length === 0 ||
          (currentGroups < maxGroupsPerChunk &&
            current.length + groupFiles.length <= maxFiles &&
            currentBytes + groupBytes <= maxBytes);
        if (!fitsInCurrent) flush();
        current.push(...groupFiles);
        currentBytes += groupBytes;
        currentGroups += 1;
        flush();
        groupFiles = [];
        groupBytes = 0;
      }
      groupFiles.push(file);
      groupBytes += file.size;
    }

    if (groupFiles.length === 0) continue;

    const fitsInCurrent =
      current.length === 0 ||
      (currentGroups < maxGroupsPerChunk &&
        current.length + groupFiles.length <= maxFiles &&
        currentBytes + groupBytes <= maxBytes);
    if (!fitsInCurrent) flush();
    current.push(...groupFiles);
    currentBytes += groupBytes;
    currentGroups += 1;
  }

  flush();
  return chunks;
}

/**
 * Chunk key images by study ID first, then by byte/file budget.
 * Keeps each study together when it fits in one request.
 */
export function chunkKeyImageFiles(files: File[], caseIds: string[] = []): File[][] {
  if (files.length === 0) return [];
  if (caseIds.length === 0) {
    return packFileGroupsIntoChunks(
      files.map((f) => [f]),
      KEY_IMAGE_CHUNK_BYTES,
      KEY_IMAGE_CHUNK_MAX_FILES,
      KEY_IMAGE_CHUNK_MAX_STUDIES,
    );
  }
  const byStudy = groupKeyImageFilesByStudyId(files, caseIds);
  return packFileGroupsIntoChunks(
    [...byStudy.values()],
    KEY_IMAGE_CHUNK_BYTES,
    KEY_IMAGE_CHUNK_MAX_FILES,
    KEY_IMAGE_CHUNK_MAX_STUDIES,
  );
}

/**
 * Chunk continuity reports by matched study ID (one report ≈ one study).
 */
export function chunkContinuityFiles(files: File[], caseIds: string[] = []): File[][] {
  if (files.length === 0) return [];
  if (caseIds.length === 0) {
    return packFileGroupsIntoChunks(
      files.map((f) => [f]),
      CONTINUITY_CHUNK_BYTES,
      CONTINUITY_CHUNK_MAX_FILES,
      CONTINUITY_CHUNK_MAX_FILES,
    );
  }
  const byStudy = new Map<string, File[]>();
  for (const file of files) {
    const studyId =
      matchContinuityReportFileToCaseId(file.name, caseIds) ?? `__unmatched__:${file.name}`;
    const list = byStudy.get(studyId) ?? [];
    list.push(file);
    byStudy.set(studyId, list);
  }
  return packFileGroupsIntoChunks(
    [...byStudy.values()],
    CONTINUITY_CHUNK_BYTES,
    CONTINUITY_CHUNK_MAX_FILES,
    CONTINUITY_CHUNK_MAX_FILES,
  );
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Upload one key-image chunk via the dedicated API route (reliable for large DICOM). */
export async function postKeyImagesChunk(
  formData: FormData,
  meta: {
    clearCaseIds: string[];
    caseIds: string[];
    caseDbIds?: string[];
    scopeOfWork?: string;
    redbrickProject?: string;
  },
): Promise<KeyImageChunkUploadResult> {
  formData.set(
    "meta",
    JSON.stringify({
      caseIds: meta.caseIds,
      clearCaseIds: meta.clearCaseIds,
      caseDbIds: meta.caseDbIds ?? [],
      scopeOfWork: meta.scopeOfWork ?? "",
      redbrickProject: meta.redbrickProject ?? "",
    }),
  );
  const res = await fetch("/api/reviewer/key-images/chunk", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });
  let body: KeyImageChunkUploadResult | null = null;
  try {
    body = (await res.json()) as KeyImageChunkUploadResult;
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    return {
      ok: false,
      error: body && !body.ok ? body.error : res.status === 413 ? "upload_size" : "network",
    };
  }
  return body;
}

async function uploadChunkWithRetry(
  uploadChunk: KeyImageChunkUploader,
  formData: FormData,
  meta: {
    clearCaseIds: string[];
    caseIds: string[];
    caseDbIds?: string[];
    scopeOfWork?: string;
    redbrickProject?: string;
  },
): Promise<KeyImageChunkUploadResult> {
  let last: KeyImageChunkUploadResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Rebuild FormData on retry — a consumed body cannot be resent.
    const fd = new FormData();
    for (const [key, value] of formData.entries()) {
      fd.append(key, value);
    }
    last = await uploadChunk(fd, meta);
    if (last.ok) return last;
    if (attempt === 0) await yieldToUi();
  }
  return last ?? { ok: false, error: "network" };
}

/**
 * Upload key images in small study-aware chunks with progress callbacks.
 * Clears existing images for a study the first time that study appears in a chunk.
 */
export async function uploadKeyImagesInChunks(input: {
  files: File[];
  caseIds: string[];
  /** Study IDs that will receive images (from client preview); cleared on first chunk for that study. */
  clearCaseIds: string[];
  caseDbIds?: string[];
  scopeOfWork?: string;
  redbrickProject?: string;
  uploadChunk: KeyImageChunkUploader;
  onProgress?: (progress: KeyImageUploadProgress) => void;
}): Promise<{
  matchedCaseCount: number;
  matchedFileCount: number;
  unmatchedPaths: string[];
}> {
  // Match study IDs locally first — never upload unmatched files.
  const analysis = analyzeKeyImageMatches(input.files, input.caseIds);
  const accepted = analysis.matchedFiles;
  const skipped = analysis.unmatchedPaths;
  const totalBytes = analysis.totalMatchedBytes;

  if (accepted.length === 0) {
    input.onProgress?.({
      percent: 100,
      filesDone: 0,
      filesTotal: 0,
      bytesDone: 0,
      bytesTotal: 0,
      chunkIndex: 0,
      chunkCount: 0,
    });
    return {
      matchedCaseCount: 0,
      matchedFileCount: 0,
      unmatchedPaths: skipped,
    };
  }

  const chunks = chunkKeyImageFiles(accepted, input.caseIds);
  let bytesDone = 0;
  let filesDone = 0;
  let matchedFileCount = 0;
  const matchedCases = new Set<string>();
  const unmatchedPaths: string[] = [...skipped];
  const clearedStudies = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const fd = new FormData();
    const chunkCaseIds = new Set<string>();
    for (const file of chunk) {
      const relativePath = fileRelativePath(file);
      const caseId = matchKeyImagePathToCaseId(relativePath, input.caseIds);
      // Browsers strip folder paths from File.name — send path + study ID explicitly.
      fd.append("keyImages", file, sanitizeKeyImageBasename(relativePath));
      fd.append("keyImagePaths", relativePath);
      fd.append("keyImageCaseIds", caseId ?? "");
      if (caseId) chunkCaseIds.add(caseId);
    }

    const studiesHere = [...chunkCaseIds].filter((id) =>
      input.clearCaseIds.includes(id),
    );
    const clearCaseIds = studiesHere.filter((id) => !clearedStudies.has(id));
    for (const id of clearCaseIds) clearedStudies.add(id);

    const scopedCaseIds =
      chunkCaseIds.size > 0 ? [...chunkCaseIds] : input.caseIds;

    const res = await uploadChunkWithRetry(input.uploadChunk, fd, {
      clearCaseIds,
      caseIds: scopedCaseIds,
      caseDbIds: input.caseDbIds,
      scopeOfWork: input.scopeOfWork,
      redbrickProject: input.redbrickProject,
    });

    if (!res.ok) {
      const err = new Error(res.error);
      (err as Error & { referenceId?: string }).referenceId = res.referenceId;
      throw err;
    }

    matchedFileCount += res.matchedFileCount;
    for (const caseId of res.matchedCaseIds) matchedCases.add(caseId);
    unmatchedPaths.push(...res.unmatchedPaths);

    bytesDone += chunk.reduce((sum, f) => sum + f.size, 0);
    filesDone += chunk.length;
    const percent = Math.min(100, Math.round((bytesDone / Math.max(totalBytes, 1)) * 100));
    input.onProgress?.({
      percent,
      filesDone,
      filesTotal: accepted.length,
      bytesDone,
      bytesTotal: totalBytes,
      chunkIndex: i + 1,
      chunkCount: chunks.length,
    });

    await yieldToUi();
  }

  return {
    matchedCaseCount: matchedCases.size,
    matchedFileCount,
    unmatchedPaths,
  };
}

/**
 * Upload continuity reports in small study-aware chunks (separate from case create/update).
 */
export async function uploadContinuityReportsInChunks(input: {
  files: File[];
  caseIds: string[];
  caseDbIds?: string[];
  scopeOfWork?: string;
  redbrickProject?: string;
  uploadChunk: ContinuityChunkUploader;
  onProgress?: (progress: KeyImageUploadProgress) => void;
}): Promise<{
  matchedCaseCount: number;
  unmatchedFilenames: string[];
}> {
  const { accepted, skipped, totalBytes } = filterContinuityFiles(input.files);
  if (accepted.length === 0) {
    input.onProgress?.({
      percent: 100,
      filesDone: 0,
      filesTotal: 0,
      bytesDone: 0,
      bytesTotal: 0,
      chunkIndex: 0,
      chunkCount: 0,
    });
    return {
      matchedCaseCount: 0,
      unmatchedFilenames: skipped,
    };
  }

  const chunks = chunkContinuityFiles(accepted, input.caseIds);
  let bytesDone = 0;
  let filesDone = 0;
  const matchedCases = new Set<string>();
  const unmatchedFilenames: string[] = [...skipped];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const fd = new FormData();
    for (const file of chunk) {
      fd.append("continuityReports", file, file.name);
    }

    const res = await input.uploadChunk(fd, {
      caseIds: input.caseIds,
      caseDbIds: input.caseDbIds,
      scopeOfWork: input.scopeOfWork,
      redbrickProject: input.redbrickProject,
    });

    if (!res.ok) {
      const err = new Error(res.error);
      (err as Error & { referenceId?: string }).referenceId = res.referenceId;
      throw err;
    }

    for (const caseId of res.matchedCaseIds) matchedCases.add(caseId);
    unmatchedFilenames.push(...res.unmatchedFilenames);

    bytesDone += chunk.reduce((sum, f) => sum + f.size, 0);
    filesDone += chunk.length;
    const percent = Math.min(100, Math.round((bytesDone / Math.max(totalBytes, 1)) * 100));
    input.onProgress?.({
      percent,
      filesDone,
      filesTotal: accepted.length,
      bytesDone,
      bytesTotal: totalBytes,
      chunkIndex: i + 1,
      chunkCount: chunks.length,
    });

    await yieldToUi();
  }

  return {
    matchedCaseCount: matchedCases.size,
    unmatchedFilenames,
  };
}
