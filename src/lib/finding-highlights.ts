import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const HIGHLIGHTS_DIR = path.join(process.cwd(), "uploads", "finding-highlights");

export type FindingHighlight = {
  id: string;
  /** Inclusive start / exclusive end char offsets into radiologistFinding. */
  start: number;
  end: number;
  note: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type FindingHighlightsFile = {
  version: 1;
  /** Snapshot length when last saved — used to drop stale highlights if text changed a lot. */
  textLength: number;
  highlights: FindingHighlight[];
};

function highlightsPath(caseDbId: string) {
  return path.join(HIGHLIGHTS_DIR, `${caseDbId}.json`);
}

export function normalizeFindingHighlightInput(
  input: { id?: string; start: number; end: number; note?: string },
  textLength: number,
  author: { id: string; name: string },
  existing?: FindingHighlight | null,
): FindingHighlight | null {
  let start = Math.floor(Number(input.start));
  let end = Math.floor(Number(input.end));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end) [start, end] = [end, start];
  start = Math.max(0, Math.min(start, textLength));
  end = Math.max(0, Math.min(end, textLength));
  if (end - start < 1) return null;
  const note = String(input.note ?? "").trim();
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? (typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID()),
    start,
    end,
    note: note.length > 2000 ? note.slice(0, 2000) : note,
    authorId: existing?.authorId ?? author.id,
    authorName: existing?.authorName ?? author.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Drop or clamp highlights that no longer fit the current finding text. */
export function sanitizeHighlightsForText(
  highlights: FindingHighlight[],
  textLength: number,
): FindingHighlight[] {
  return highlights
    .map((h) => {
      const start = Math.max(0, Math.min(h.start, textLength));
      const end = Math.max(0, Math.min(h.end, textLength));
      if (end - start < 1) return null;
      return { ...h, start, end };
    })
    .filter((h): h is FindingHighlight => h != null)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export async function readFindingHighlights(caseDbId: string): Promise<FindingHighlightsFile> {
  try {
    const raw = await readFile(highlightsPath(caseDbId), "utf8");
    const parsed = JSON.parse(raw) as Partial<FindingHighlightsFile>;
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.filter(
          (h): h is FindingHighlight =>
            !!h &&
            typeof h === "object" &&
            typeof h.id === "string" &&
            typeof h.start === "number" &&
            typeof h.end === "number" &&
            typeof h.note === "string",
        )
      : [];
    return {
      version: 1,
      textLength: typeof parsed.textLength === "number" ? parsed.textLength : 0,
      highlights,
    };
  } catch {
    return { version: 1, textLength: 0, highlights: [] };
  }
}

export async function writeFindingHighlights(
  caseDbId: string,
  data: FindingHighlightsFile,
): Promise<void> {
  await mkdir(HIGHLIGHTS_DIR, { recursive: true });
  await writeFile(highlightsPath(caseDbId), JSON.stringify(data, null, 2), "utf8");
}

export async function upsertFindingHighlight(
  caseDbId: string,
  highlight: FindingHighlight,
  textLength: number,
): Promise<FindingHighlightsFile> {
  const data = await readFindingHighlights(caseDbId);
  const idx = data.highlights.findIndex((h) => h.id === highlight.id);
  if (idx >= 0) data.highlights[idx] = highlight;
  else data.highlights.push(highlight);
  data.textLength = textLength;
  data.highlights = sanitizeHighlightsForText(data.highlights, textLength);
  await writeFindingHighlights(caseDbId, data);
  return data;
}

export async function deleteFindingHighlight(
  caseDbId: string,
  highlightId: string,
  textLength: number,
): Promise<FindingHighlightsFile> {
  const data = await readFindingHighlights(caseDbId);
  data.highlights = data.highlights.filter((h) => h.id !== highlightId);
  data.textLength = textLength;
  data.highlights = sanitizeHighlightsForText(data.highlights, textLength);
  await writeFindingHighlights(caseDbId, data);
  return data;
}
