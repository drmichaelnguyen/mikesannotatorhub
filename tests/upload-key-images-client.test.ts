import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeKeyImageMatches,
  chunkContinuityFiles,
  chunkKeyImageFiles,
  filterKeyImageFiles,
  KEY_IMAGE_CHUNK_BYTES,
  KEY_IMAGE_CHUNK_MAX_FILES,
  KEY_IMAGE_CHUNK_MAX_STUDIES,
} from "../src/lib/upload-key-images-client";

function fakeFile(name: string, size: number, relativePath?: string): File {
  const bytes = new Uint8Array(Math.min(size, 8));
  const file = new File([bytes], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  if (relativePath) {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  }
  return file;
}

describe("upload-key-images-client", () => {
  it("filters non-images and oversized files", () => {
    const { accepted, skipped } = filterKeyImageFiles([
      fakeFile("a.png", 100, "id/a.png"),
      fakeFile("note.txt", 10, "id/note.txt"),
      fakeFile("huge.png", 40 * 1024 * 1024, "id/huge.png"),
    ]);
    assert.equal(accepted.length, 1);
    assert.equal(skipped.length, 2);
  });

  it("chunks by byte budget and file count", () => {
    const files = Array.from({ length: KEY_IMAGE_CHUNK_MAX_FILES + 2 }, (_, i) =>
      fakeFile(`img${i}.jpg`, Math.floor(KEY_IMAGE_CHUNK_BYTES / 4), `study/img${i}.jpg`),
    );
    const chunks = chunkKeyImageFiles(files);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.length <= KEY_IMAGE_CHUNK_MAX_FILES));
  });

  it("keeps study folders together across chunks when they fit", () => {
    const caseIds = ["study-a", "study-b", "study-c", "study-d", "study-e"];
    const files = caseIds.flatMap((id) => [
      fakeFile("1.jpg", 100_000, `${id}/1.jpg`),
      fakeFile("2.jpg", 100_000, `${id}/2.jpg`),
    ]);
    const chunks = chunkKeyImageFiles(files, caseIds);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.length <= Math.ceil(caseIds.length / KEY_IMAGE_CHUNK_MAX_STUDIES));
    for (const chunk of chunks) {
      const studies = new Set(
        chunk.map((f) => (f.webkitRelativePath || f.name).split("/")[0]),
      );
      assert.ok(studies.size <= KEY_IMAGE_CHUNK_MAX_STUDIES);
    }
  });

  it("chunks continuity reports by study id", () => {
    const caseIds = Array.from({ length: 25 }, (_, i) => `case-${i}`);
    const files = caseIds.map((id) =>
      fakeFile(`ContinuityReport_${id}.html`, 50_000, `ContinuityReport_${id}.html`),
    );
    const chunks = chunkContinuityFiles(files, caseIds);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.length <= 20));
  });

  it("analyzes study-id matches before upload", () => {
    const caseIds = ["study-a", "study-b"];
    const analysis = analyzeKeyImageMatches(
      [
        fakeFile("1.jpg", 1000, "study-a/1.jpg"),
        fakeFile("2.jpg", 1000, "other/2.jpg"),
        fakeFile("note.txt", 10, "study-a/note.txt"),
      ],
      caseIds,
    );
    assert.equal(analysis.matchedFiles.length, 1);
    assert.deepEqual(analysis.matchedCaseIds, ["study-a"]);
    assert.ok(analysis.unmatchedPaths.some((p) => p.includes("other/2.jpg")));
    assert.ok(analysis.unmatchedPaths.some((p) => p.includes("note.txt")));
  });
});
