import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isKeyImageFilename,
  matchKeyImagePathToCaseId,
  sanitizeKeyImageBasename,
} from "../src/lib/key-image-path";

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

  it("returns null when no segment matches", () => {
    assert.equal(
      matchKeyImagePathToCaseId("batch/other/img.png", caseIds),
      null,
    );
  });

  it("detects image extensions", () => {
    assert.equal(isKeyImageFilename("a.PNG"), true);
    assert.equal(isKeyImageFilename("a.html"), false);
  });

  it("sanitizes basenames", () => {
    assert.equal(sanitizeKeyImageBasename("../../evil.png"), "evil.png");
    assert.equal(sanitizeKeyImageBasename("folder/ok-name (1).jpg"), "ok-name (1).jpg");
  });
});
