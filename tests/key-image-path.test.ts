import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isKeyImageFilename,
  isPlausibleKeyImageFile,
  matchKeyImagePathToCaseId,
  sanitizeKeyImageBasename,
} from "../src/lib/key-image-path";
import { analyzeKeyImageMatches } from "../src/lib/upload-key-images-client";

describe("key-image-path", () => {
  const caseIds = [
    "asi-708cbd32-1111-2222-3333-444444444444",
    "ABC-001",
  ];

  it("matches parent folder to study id", () => {
    assert.equal(
      matchKeyImagePathToCaseId(
        "KeyImages/asi-708cbd32-1111-2222-3333-444444444444/slice1.png",
        caseIds,
      ),
      "asi-708cbd32-1111-2222-3333-444444444444",
    );
  });

  it("matches nested subfolders containing study id", () => {
    assert.equal(
      matchKeyImagePathToCaseId(
        "batch/asi-708cbd32-1111-2222-3333-444444444444/series/IM0001",
        caseIds,
      ),
      "asi-708cbd32-1111-2222-3333-444444444444",
    );
    assert.equal(
      matchKeyImagePathToCaseId(
        "root/Study_asi-708cbd32-1111-2222-3333-444444444444_CT/1.dcm",
        caseIds,
      ),
      "asi-708cbd32-1111-2222-3333-444444444444",
    );
  });

  it("matches folder without asi- prefix", () => {
    assert.equal(
      matchKeyImagePathToCaseId(
        "export/708cbd32-1111-2222-3333-444444444444/key.jpg",
        caseIds,
      ),
      "asi-708cbd32-1111-2222-3333-444444444444",
    );
  });

  it("matches custom case ids in subfolders", () => {
    assert.equal(
      matchKeyImagePathToCaseId("batch/ABC-001/img.webp", caseIds),
      "ABC-001",
    );
  });

  it("matches flat files named as the study id", () => {
    assert.equal(matchKeyImagePathToCaseId("ABC-001.png", caseIds), "ABC-001");
    assert.equal(
      matchKeyImagePathToCaseId("708cbd32-1111-2222-3333-444444444444.jpg", caseIds),
      "asi-708cbd32-1111-2222-3333-444444444444",
    );
  });

  it("returns null when no segment matches", () => {
    assert.equal(matchKeyImagePathToCaseId("batch/other/img.png", caseIds), null);
  });

  it("detects image extensions", () => {
    assert.equal(isKeyImageFilename("a.PNG"), true);
    assert.equal(isKeyImageFilename("a.dcm"), true);
    assert.equal(isKeyImageFilename("slice.DICOM"), true);
    assert.equal(isKeyImageFilename("a.html"), false);
    assert.equal(isPlausibleKeyImageFile("IM0001"), true);
    assert.equal(isPlausibleKeyImageFile("notes.txt"), false);
  });

  it("sanitizes basenames", () => {
    assert.equal(sanitizeKeyImageBasename("../../evil.png"), "evil.png");
    assert.equal(sanitizeKeyImageBasename("folder/ok-name (1).jpg"), "ok-name (1).jpg");
  });
});

describe("analyzeKeyImageMatches nested dicom", () => {
  function fakeFile(name: string, size: number, relativePath?: string): File {
    const bytes = new Uint8Array(Math.min(size, 8));
    const file = new File([bytes], name, { type: "application/dicom" });
    Object.defineProperty(file, "size", { value: size });
    if (relativePath) {
      Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
    }
    return file;
  }

  it("matches extensionless dicom files under nested study folders", () => {
    const caseIds = ["asi-708cbd32-1111-2222-3333-444444444444"];
    const analysis = analyzeKeyImageMatches(
      [
        fakeFile("IM0001", 1000, "batch/asi-708cbd32-1111-2222-3333-444444444444/series/IM0001"),
        fakeFile("2.dcm", 1000, "batch/asi-708cbd32-1111-2222-3333-444444444444/2.dcm"),
        fakeFile("readme.txt", 10, "batch/asi-708cbd32-1111-2222-3333-444444444444/readme.txt"),
      ],
      caseIds,
    );
    assert.equal(analysis.matchedFiles.length, 2);
    assert.deepEqual(analysis.matchedCaseIds, caseIds);
    assert.ok(analysis.unmatchedPaths.some((p) => p.includes("readme.txt")));
  });
});
