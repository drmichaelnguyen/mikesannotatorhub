const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Pull the external case id from a continuity report filename. */
export function extractContinuityReportCaseId(filename: string): string | null {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  if (!base) return null;

  const continuityMatch = base.match(/^ContinuityReport[_-](.+)\.html?$/i);
  if (continuityMatch?.[1]) return continuityMatch[1].trim();

  const uuidMatch = base.match(UUID_RE);
  if (uuidMatch?.[0]) return uuidMatch[0];

  const withoutExt = base.replace(/\.html?$/i, "").trim();
  return withoutExt || null;
}

export function matchContinuityReportFileToCaseId(
  filename: string,
  caseIds: Iterable<string>,
): string | null {
  const extracted = extractContinuityReportCaseId(filename);
  if (!extracted) return null;

  const caseIdSet = new Set(caseIds);
  if (caseIdSet.has(extracted)) return extracted;

  const lowerExtracted = extracted.toLowerCase();
  for (const caseId of caseIdSet) {
    if (caseId.toLowerCase() === lowerExtracted) return caseId;
  }

  for (const caseId of caseIdSet) {
    if (filename.includes(caseId)) return caseId;
  }

  return null;
}
