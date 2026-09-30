import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const KEY_IMAGES_DIR = path.join(process.cwd(), "uploads", "key-images");
const ANNOTATIONS_FILENAME = "_annotations.json";
const MAX_POINTS_PER_STROKE = 2000;

export type KeyImagePoint = { x: number; y: number };

export type KeyImageMark = {
  id: string;
  /** Key image filename within the case folder. */
  filename: string;
  /**
   * Freehand stroke in normalized 0–1 image coordinates.
   * Legacy pin marks may omit this and only have x/y.
   */
  points: KeyImagePoint[];
  /** Legacy pin center (kept for older annotations). */
  x: number;
  y: number;
  note: string;
  color: string;
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

function normalizePoints(raw: unknown): KeyImagePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: KeyImagePoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const x = clamp01(Number((p as KeyImagePoint).x));
    const y = clamp01(Number((p as KeyImagePoint).y));
    if (!Number.isFinite(Number((p as KeyImagePoint).x)) || !Number.isFinite(Number((p as KeyImagePoint).y))) {
      continue;
    }
    out.push({ x, y });
    if (out.length >= MAX_POINTS_PER_STROKE) break;
  }
  return out;
}

/** Downsample long strokes while keeping endpoints. */
function simplifyPoints(points: KeyImagePoint[], maxPoints = 400): KeyImagePoint[] {
  if (points.length <= maxPoints) return points;
  const out: KeyImagePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    out.push(points[idx]!);
  }
  return out;
}

function isValidStoredMark(m: unknown): m is KeyImageMark {
  if (!m || typeof m !== "object") return false;
  const row = m as Partial<KeyImageMark>;
  if (typeof row.id !== "string" || typeof row.filename !== "string" || typeof row.note !== "string") {
    return false;
  }
  const points = normalizePoints(row.points);
  const hasPin = typeof row.x === "number" && typeof row.y === "number";
  return points.length >= 1 || hasPin;
}

export function normalizeKeyImageMarkInput(
  input: Partial<KeyImageMark> & { filename: string },
  author: { id: string; name: string },
  existing?: KeyImageMark | null,
): KeyImageMark | null {
  const filename = String(input.filename ?? "").trim();
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }

  let points = simplifyPoints(normalizePoints(input.points));
  if (points.length === 0 && typeof input.x === "number" && typeof input.y === "number") {
    points = [{ x: clamp01(input.x), y: clamp01(input.y) }];
  }
  if (points.length === 0 && existing?.points?.length) {
    points = existing.points;
  }
  if (points.length === 0) return null;

  const note = String(input.note ?? existing?.note ?? "").trim();
  const colorRaw = String(input.color ?? existing?.color ?? "#ef4444").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : "#ef4444";
  const now = new Date().toISOString();
  const center = points[Math.floor(points.length / 2)]!;

  return {
    id: existing?.id ?? (typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID()),
    filename,
    points,
    x: center.x,
    y: center.y,
    note: note.length > 4000 ? note.slice(0, 4000) : note,
    color,
    authorId: existing?.authorId ?? author.id,
    authorName: existing?.authorName ?? author.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function hydrateMark(raw: KeyImageMark): KeyImageMark {
  const points = normalizePoints(raw.points);
  const fallback =
    points.length > 0
      ? points
      : typeof raw.x === "number" && typeof raw.y === "number"
        ? [{ x: clamp01(raw.x), y: clamp01(raw.y) }]
        : [];
  const center = fallback[Math.floor(fallback.length / 2)] ?? { x: 0, y: 0 };
  return {
    ...raw,
    points: fallback,
    x: center.x,
    y: center.y,
    color: typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : "#ef4444",
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

export async function readKeyImageAnnotations(caseDbId: string): Promise<KeyImageAnnotationsFile> {
  try {
    const raw = await readFile(annotationsPath(caseDbId), "utf8");
    const parsed = JSON.parse(raw) as Partial<KeyImageAnnotationsFile>;
    const marks = Array.isArray(parsed.marks)
      ? parsed.marks.filter(isValidStoredMark).map(hydrateMark)
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

export function strokePathD(points: KeyImagePoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x * 100} ${first!.y * 100}`;
  for (const p of rest) {
    d += ` L ${p.x * 100} ${p.y * 100}`;
  }
  return d;
}
