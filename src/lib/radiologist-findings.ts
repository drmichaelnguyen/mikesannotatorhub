/**
 * Parse a pasted table of radiologist findings.
 * First column = study / case ID; remaining columns = findings (joined with newlines).
 * Supports tab-separated (Excel/Sheets paste), comma-separated rows (including quoted cells),
 * and line-oriented pastes where each finding row starts with a study/case ID.
 *
 * Typical paste:
 *   study_id\tfinal_impressions
 *   asi-708cbd32-…\tThere is an indeterminate…
 */

/** UUID with optional `asi-` prefix (case-insensitive). */
const STUDY_ID_PREFIX_RE =
  /^(asi-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function parseRadiologistFindingsTable(text: string): Map<string, string> {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return new Map();

  const fromTable = parseDelimitedFindingsTable(normalized);
  if (fromTable.size >= 2) return fromTable;

  const fromLines = parseFindingsByStudyIdLines(normalized);
  if (fromLines.size > fromTable.size) return fromLines;

  return fromTable.size > 0 ? fromTable : fromLines;
}

/** True when text looks like a multi-row study_id → finding table (not a single finding). */
export function looksLikeRadiologistFindingsTable(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return false;
  const parsed = parseRadiologistFindingsTable(trimmed);
  if (parsed.size >= 2) return true;
  if (parsed.size === 1) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2 && isHeaderRow(splitCellsLoose(lines[0]!))) return true;
  }
  return false;
}

/**
 * Resolve per-case findings, never broadcasting a pasted table as one shared finding.
 * If `sharedFinding` looks like a table, it is parsed and merged (does not win over explicit map entries).
 */
export function resolvePerCaseRadiologistFindings(input: {
  caseIds: string[];
  /** Explicit per-case map (keys = case / study IDs). */
  findingsByCaseId?: Map<string, string> | Record<string, string>;
  /** Shared default — applied only when it is NOT a multi-row findings table. */
  sharedFinding?: string;
}): Map<string, string> {
  const explicit = toFindingsMap(input.findingsByCaseId);
  const shared = (input.sharedFinding ?? "").trim();
  const fromSharedTable =
    shared && looksLikeRadiologistFindingsTable(shared)
      ? parseRadiologistFindingsTable(shared)
      : new Map<string, string>();

  const mergedSource = new Map<string, string>();
  for (const [k, v] of fromSharedTable) mergedSource.set(k, v);
  for (const [k, v] of explicit) mergedSource.set(k, v);

  const { matched } = matchFindingsToCaseIds(mergedSource, input.caseIds);
  const out = new Map<string, string>(matched.map((m) => [m.caseId, m.finding]));

  const sharedIsPlain = shared && !looksLikeRadiologistFindingsTable(shared);
  if (sharedIsPlain) {
    for (const caseId of input.caseIds) {
      if (!out.has(caseId)) out.set(caseId, shared);
    }
  }
  return out;
}

function toFindingsMap(
  raw: Map<string, string> | Record<string, string> | undefined,
): Map<string, string> {
  if (!raw) return new Map();
  if (raw instanceof Map) return raw;
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    const caseId = key.trim();
    const finding = String(value ?? "").trim();
    if (!caseId || !finding) continue;
    map.set(caseId, finding);
  }
  return map;
}

function parseDelimitedFindingsTable(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const rows = parseTableRows(text);
  for (const cells of rows) {
    if (cells.length === 0) continue;
    const studyId = cells[0]!.trim();
    if (!studyId) continue;
    if (isHeaderRow(cells)) continue;

    const findings = cells
      .slice(1)
      .map((c) => decodeHtmlEntities(c.trim()))
      .filter(Boolean);
    if (findings.length === 0) continue;
    map.set(studyId, findings.join("\n"));
  }
  return map;
}

/**
 * Line-oriented parse: a new finding starts when a line begins with a study/case ID.
 * Continuation lines (common when Excel cells contain newlines) append to the current finding.
 * Also handles `study_id<whitespace>finding` when tabs were lost on paste.
 */
function parseFindingsByStudyIdLines(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  let currentId: string | null = null;
  let currentParts: string[] = [];

  const flush = () => {
    if (!currentId) return;
    const finding = decodeHtmlEntities(currentParts.join("\n").trim());
    if (finding) map.set(currentId, finding);
    currentId = null;
    currentParts = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, " ").trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentId) currentParts.push("");
      continue;
    }

    if (currentId == null && isHeaderRow(splitCellsLoose(trimmed))) {
      continue;
    }

    const idMatch = trimmed.match(STUDY_ID_PREFIX_RE);
    if (idMatch && idMatch.index === 0) {
      const studyId = idMatch[0]!;
      const rest = trimmed.slice(studyId.length).replace(/^[\s|,;:]+/, "");
      // Avoid treating a bare ID continuation as a new row when rest is empty and we already
      // have a current finding — still start a new row (empty findings are dropped on flush).
      flush();
      currentId = studyId;
      currentParts = rest ? [rest] : [];
      continue;
    }

    if (currentId) {
      currentParts.push(trimmed);
    }
  }
  flush();
  return map;
}

function splitCellsLoose(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes(",")) return line.split(",").map((c) => c.trim());
  return line.trim().split(/\s+/).filter(Boolean);
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

function isHeaderRow(cells: string[]): boolean {
  const first = cells[0]?.trim() ?? "";
  if (!first) return false;
  const firstNorm = first.toLowerCase().replace(/[\s_]+/g, "");
  const isIdHeader =
    firstNorm === "studyid" ||
    firstNorm === "caseid" ||
    firstNorm === "study" ||
    firstNorm === "id" ||
    /^(study|case)[\s_-]*id$/i.test(first);

  if (!isIdHeader) return false;
  if (cells.length === 1) return true;

  const rest = cells.slice(1).map((c) => c.trim().toLowerCase());
  if (rest.every((c) => !c)) return true;
  return rest.every(
    (c) =>
      !c ||
      /finding|impression|rads?|radiolog|result|note|column|final/i.test(c),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ");
}

/** Normalize study/case IDs for matching (case-insensitive; optional `asi-` prefix). */
export function normalizeStudyId(id: string): string {
  let s = id.trim().toLowerCase();
  if (s.startsWith("asi-")) s = s.slice(4);
  return s;
}

/** Match parsed findings to a list of case IDs (exact, then normalized). */
export function matchFindingsToCaseIds(
  findingsByStudyId: Map<string, string>,
  caseIds: string[],
): {
  matched: { caseId: string; finding: string }[];
  unmatchedStudyIds: string[];
  unmatchedCaseIds: string[];
} {
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const caseId of caseIds) {
    byExact.set(caseId, caseId);
    const norm = normalizeStudyId(caseId);
    if (!byNorm.has(norm)) byNorm.set(norm, caseId);
  }

  const matched: { caseId: string; finding: string }[] = [];
  const unmatchedStudyIds: string[] = [];
  const usedCaseIds = new Set<string>();

  for (const [studyId, finding] of findingsByStudyId) {
    const exact = byExact.get(studyId) ?? byExact.get(studyId.trim());
    const viaNorm = byNorm.get(normalizeStudyId(studyId));
    const caseId = exact ?? viaNorm;
    if (caseId && !usedCaseIds.has(caseId)) {
      matched.push({ caseId, finding });
      usedCaseIds.add(caseId);
    } else if (!caseId) {
      unmatchedStudyIds.push(studyId);
    }
  }

  const unmatchedCaseIds = caseIds.filter((id) => !usedCaseIds.has(id));
  return { matched, unmatchedStudyIds, unmatchedCaseIds };
}

export function findingsMapToJson(map: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(map));
}

export function findingsMapFromJson(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw.trim()) return map;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return map;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const caseId = key.trim();
      if (!caseId) continue;
      if (typeof value !== "string") continue;
      const finding = value.trim();
      if (!finding) continue;
      map.set(caseId, finding);
    }
  } catch {
    return map;
  }
  return map;
}
