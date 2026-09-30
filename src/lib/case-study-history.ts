import { normalizeStudyId } from "@/lib/radiologist-findings";

/** One prior labeling/review stage for a study. */
export type CaseStudyHistoryStage = {
  stage: string;
  batchId: string;
  annotator: string;
  dateAssigned: string;
  dateCompleted: string;
  status: string;
  notes: string;
};

export type ParsedCaseStudyHistoryRow = {
  studyId: string;
  studyIdNorm: string;
  redbrickStage: string;
  stages: CaseStudyHistoryStage[];
};

const DEFAULT_STAGE_NAMES = ["PreLabeling Stage", "Label Stage", "Review 1"];

type ColumnKind =
  | { kind: "studyId" }
  | { kind: "redbrickStage" }
  | { kind: "batchId"; stageIndex: number }
  | { kind: "annotator"; stageIndex: number }
  | { kind: "dateAssigned"; stageIndex: number }
  | { kind: "dateCompleted"; stageIndex: number }
  | { kind: "status"; stageIndex: number }
  | { kind: "notes"; stageIndex: number }
  | { kind: "unknown" };

/**
 * Parse a RedBrick-style case history spreadsheet (paste or CSV).
 * Keyed by Study ID; stage groups are Batch/Annotator/Dates/Status/Notes columns
 * (optionally under a PreLabeling / Label / Review super-header row).
 */
export function parseCaseStudyHistoryTable(text: string): ParsedCaseStudyHistoryRow[] {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return [];

  const rows = parseTableRows(normalized);
  if (rows.length === 0) return [];

  const headerIdx = rows.findIndex((cells) => isStudyIdHeaderCell(cells[0] ?? ""));
  if (headerIdx < 0) return [];

  const header = rows[headerIdx]!.map((c) => c.trim());
  const stageNamesFromSuper =
    headerIdx > 0 ? extractStageNamesFromSuperHeader(rows[headerIdx - 1]!, header.length) : [];
  const columns = mapHeaderColumns(header);
  const maxStage = Math.max(0, ...columns.map((c) => ("stageIndex" in c ? c.stageIndex : 0)));

  const out: ParsedCaseStudyHistoryRow[] = [];
  const seen = new Map<string, number>();

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const studyId = pickCell(cells, columns, "studyId").trim();
    if (!studyId) continue;
    if (isStudyIdHeaderCell(studyId)) continue;

    const redbrickStage = pickCell(cells, columns, "redbrickStage").trim();
    const stages: CaseStudyHistoryStage[] = [];

    for (let stageIndex = 1; stageIndex <= maxStage; stageIndex++) {
      const stage: CaseStudyHistoryStage = {
        stage:
          stageNamesFromSuper[stageIndex - 1] ||
          DEFAULT_STAGE_NAMES[stageIndex - 1] ||
          `Stage ${stageIndex}`,
        batchId: pickStageCell(cells, columns, "batchId", stageIndex),
        annotator: pickStageCell(cells, columns, "annotator", stageIndex),
        dateAssigned: pickStageCell(cells, columns, "dateAssigned", stageIndex),
        dateCompleted: pickStageCell(cells, columns, "dateCompleted", stageIndex),
        status: pickStageCell(cells, columns, "status", stageIndex),
        notes: pickStageCell(cells, columns, "notes", stageIndex),
      };
      if (stageHasContent(stage)) stages.push(stage);
    }

    const studyIdNorm = normalizeStudyId(studyId);
    const row: ParsedCaseStudyHistoryRow = {
      studyId,
      studyIdNorm,
      redbrickStage,
      stages,
    };

    const existing = seen.get(studyIdNorm);
    if (existing != null) {
      out[existing] = row;
    } else {
      seen.set(studyIdNorm, out.length);
      out.push(row);
    }
  }

  return out;
}

export function stagesToJson(stages: CaseStudyHistoryStage[]): string {
  return JSON.stringify(stages);
}

export function stagesFromJson(raw: string): CaseStudyHistoryStage[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        return {
          stage: String(o.stage ?? "").trim(),
          batchId: String(o.batchId ?? "").trim(),
          annotator: String(o.annotator ?? "").trim(),
          dateAssigned: String(o.dateAssigned ?? "").trim(),
          dateCompleted: String(o.dateCompleted ?? "").trim(),
          status: String(o.status ?? "").trim(),
          notes: String(o.notes ?? "").trim(),
        } satisfies CaseStudyHistoryStage;
      })
      .filter((s): s is CaseStudyHistoryStage => s != null && stageHasContent(s));
  } catch {
    return [];
  }
}

function stageHasContent(stage: CaseStudyHistoryStage): boolean {
  return Boolean(
    stage.batchId ||
      stage.annotator ||
      stage.dateAssigned ||
      stage.dateCompleted ||
      stage.status ||
      stage.notes,
  );
}

function isStudyIdHeaderCell(value: string): boolean {
  const norm = value.trim().toLowerCase().replace(/[\s_]+/g, "");
  return (
    norm === "studyid" ||
    norm === "caseid" ||
    /^(study|case)[\s_-]*id$/i.test(value.trim())
  );
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/\s+/g, " ");
}

function mapHeaderColumns(header: string[]): ColumnKind[] {
  let notesStageCursor = 0;
  return header.map((raw) => {
    const h = normalizeHeader(raw);
    if (!h) return { kind: "unknown" as const };
    if (isStudyIdHeaderCell(raw)) return { kind: "studyId" as const };
    if (/^redbrick\s*stage$/.test(h) || h === "redbrickstage" || h === "rb stage") {
      return { kind: "redbrickStage" as const };
    }

    const numbered = h.match(
      /^(batch\s*id|annotator|date\s*assigned|date\s*completed|status)\s*(\d+)$/,
    );
    if (numbered) {
      const field = numbered[1]!.replace(/\s+/g, " ");
      const stageIndex = Number(numbered[2]);
      if (field === "batch id") return { kind: "batchId", stageIndex };
      if (field === "annotator") return { kind: "annotator", stageIndex };
      if (field === "date assigned") return { kind: "dateAssigned", stageIndex };
      if (field === "date completed") return { kind: "dateCompleted", stageIndex };
      if (field === "status") return { kind: "status", stageIndex };
    }

    // Bare "Notes" columns assigned left-to-right to stage groups.
    if (h === "notes" || h === "note" || /^notes?\s*\d+$/.test(h)) {
      const m = h.match(/^notes?\s*(\d+)$/);
      if (m) return { kind: "notes", stageIndex: Number(m[1]) };
      notesStageCursor += 1;
      return { kind: "notes", stageIndex: notesStageCursor };
    }

    return { kind: "unknown" as const };
  });
}

/**
 * Super-header cells usually appear only at the start of each stage group
 * (e.g. "PreLabeling Stage", "Label Stage", "Review 1").
 */
function extractStageNamesFromSuperHeader(superRow: string[], width: number): string[] {
  const cells = Array.from({ length: width }, (_, i) => (superRow[i] ?? "").trim());
  const labels: string[] = [];
  for (const cell of cells) {
    if (!cell) continue;
    if (!/stage|prelabel|label|review/i.test(cell)) continue;
    if (labels[labels.length - 1] === cell) continue;
    labels.push(cell);
  }
  return labels;
}

function pickCell(
  cells: string[],
  columns: ColumnKind[],
  kind: "studyId" | "redbrickStage",
): string {
  const idx = columns.findIndex((c) => c.kind === kind);
  if (idx < 0) return "";
  return (cells[idx] ?? "").trim();
}

function pickStageCell(
  cells: string[],
  columns: ColumnKind[],
  kind: "batchId" | "annotator" | "dateAssigned" | "dateCompleted" | "status" | "notes",
  stageIndex: number,
): string {
  const idx = columns.findIndex(
    (c) => c.kind === kind && "stageIndex" in c && c.stageIndex === stageIndex,
  );
  if (idx < 0) return "";
  return (cells[idx] ?? "").trim();
}

function parseTableRows(text: string): string[][] {
  const preferTab = text.includes("\t");
  const delimiter = preferTab ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    current += ch;
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
