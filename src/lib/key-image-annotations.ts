import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const KEY_IMAGES_DIR = path.join(process.cwd(), "uploads", "key-images");
const ANNOTATIONS_FILENAME = "_annotations.json";

export type KeyImageMark = {
  id: string;
  /** Key image filename within the case folder. */
  filename: string;
  /** Normalized 0–1 position within the displayed image. */
  x: number;
  y: number;
  note: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type KeyImageAnnotationsFile = {
  version: 1;
  marks: KeyImageMark[];
};

function annotationsPath(caseDbId: string) {
  return path.join(KEY_IMAGES_DIR, caseDbId, ANNOTATIONS_FILENAME);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeKeyImageMarkInput(
  input: Partial<KeyImageMark> & { filename: string; note: string; x: number; y: number },
  author: { id: string; name: string },
  existing?: KeyImageMark | null,
): KeyImageMark | null {
  const filename = String(input.filename ?? "").trim();
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  const note = String(input.note ?? "").trim();
  if (!note) return null;
  const x = clamp01(Number(input.x));
  const y = clamp01(Number(input.y));
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? (typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID()),
    filename,
    x,
    y,
    note: note.length > 4000 ? note.slice(0, 4000) : note,
    authorId: existing?.authorId ?? author.id,
    authorName: existing?.authorName ?? author.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function readKeyImageAnnotations(caseDbId: string): Promise<KeyImageAnnotationsFile> {
  try {
    const raw = await readFile(annotationsPath(caseDbId), "utf8");
    const parsed = JSON.parse(raw) as Partial<KeyImageAnnotationsFile>;
    const marks = Array.isArray(parsed.marks)
      ? parsed.marks.filter(
          (m): m is KeyImageMark =>
            !!m &&
            typeof m === "object" &&
            typeof m.id === "string" &&
            typeof m.filename === "string" &&
            typeof m.note === "string" &&
            typeof m.x === "number" &&
            typeof m.y === "number",
        )
      : [];
    return { version: 1, marks };
  } catch {
    return { version: 1, marks: [] };
  }
}

export async function writeKeyImageAnnotations(
  caseDbId: string,
  data: KeyImageAnnotationsFile,
): Promise<void> {
  const dir = path.join(KEY_IMAGES_DIR, caseDbId);
  await mkdir(dir, { recursive: true });
  const payload: KeyImageAnnotationsFile = {
    version: 1,
    marks: data.marks,
  };
  await writeFile(annotationsPath(caseDbId), JSON.stringify(payload, null, 2), "utf8");
}

export async function upsertKeyImageMark(
  caseDbId: string,
  mark: KeyImageMark,
): Promise<KeyImageAnnotationsFile> {
  const data = await readKeyImageAnnotations(caseDbId);
  const idx = data.marks.findIndex((m) => m.id === mark.id);
  if (idx >= 0) data.marks[idx] = mark;
  else data.marks.push(mark);
  await writeKeyImageAnnotations(caseDbId, data);
  return data;
}

export async function deleteKeyImageMark(
  caseDbId: string,
  markId: string,
): Promise<KeyImageAnnotationsFile> {
  const data = await readKeyImageAnnotations(caseDbId);
  data.marks = data.marks.filter((m) => m.id !== markId);
  await writeKeyImageAnnotations(caseDbId, data);
  return data;
}
