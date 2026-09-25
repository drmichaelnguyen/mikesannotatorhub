import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunkKeyImageFiles,
  filterKeyImageFiles,
  KEY_IMAGE_CHUNK_BYTES,
  KEY_IMAGE_CHUNK_MAX_FILES,
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
});
