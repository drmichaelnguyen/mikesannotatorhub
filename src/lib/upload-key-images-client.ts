import {
  isKeyImageFilename,
  KEY_IMAGE_MAX_FILE_BYTES,
} from "@/lib/key-image-path";

/** Target size per chunk request (keeps server memory and body limit safe). */
export const KEY_IMAGE_CHUNK_BYTES = 8 * 1024 * 1024;
export const KEY_IMAGE_CHUNK_MAX_FILES = 16;
/** Overall folder cap across all chunks. */
export const KEY_IMAGE_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;
/** Continuity reports go in a single request; must stay under `bodySizeLimit` in next.config.ts. */
export const CONTINUITY_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

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
    if (!isKeyImageFilename(relativePath)) {
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

export function chunkKeyImageFiles(files: File[]): File[][] {
  const chunks: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const wouldExceedBytes =
      current.length > 0 && currentBytes + file.size > KEY_IMAGE_CHUNK_BYTES;
    const wouldExceedCount = current.length >= KEY_IMAGE_CHUNK_MAX_FILES;
    if (wouldExceedBytes || wouldExceedCount) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Upload key images in small chunks with progress callbacks.
 * First chunk clears existing images for the provided clearCaseIds.
 */
export async function uploadKeyImagesInChunks(input: {
  files: File[];
  caseIds: string[];
  /** Study IDs that will receive images (from client preview); cleared on first chunk. */
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
  const { accepted, skipped, totalBytes } = filterKeyImageFiles(input.files);
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

  const chunks = chunkKeyImageFiles(accepted);
  let bytesDone = 0;
  let filesDone = 0;
  let matchedFileCount = 0;
  const matchedCases = new Set<string>();
  const unmatchedPaths: string[] = [...skipped];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const fd = new FormData();
    for (const file of chunk) {
      fd.append("keyImages", file, fileRelativePath(file));
    }

    const res = await input.uploadChunk(fd, {
      clearCaseIds: i === 0 ? input.clearCaseIds : [],
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
