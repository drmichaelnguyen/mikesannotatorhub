function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove repeated leading "Field label:" prefixes from template note bodies.
 * Users may paste or type the label again after the UI prefilled it.
 */
export function stripRepeatedTemplateLabelPrefix(rowLabel: string, body: string): string {
  const cleanLabel = rowLabel.replace(/\s*:\s*$/, "").trim();
  let v = body.trim();
  if (!cleanLabel) return v;
  const re = new RegExp(`^${escapeRegExp(cleanLabel)}\\s*:\\s*`, "i");
  let guard = 0;
  while (re.test(v) && guard < 10) {
    v = v.replace(re, "").trim();
    guard += 1;
  }
  return v;
}

/** Prefills the discussion composer when a template row is selected (matches `buildTemplateRowNote` label rules). */
export function defaultTemplateRowComposerBody(rowLabel: string): string {
  const cleanLabel = rowLabel.replace(/\s*:\s*$/, "").trim();
  return cleanLabel ? `${cleanLabel}: ` : "";
}

/** Draft text for the comment box: answer only (field label is shown separately in the UI). */
export function composerAnswerDraftForTemplateRow(
  rowIndex: number,
  notes: { content: string | null }[],
  templateRows: string[],
): string {
  const row = templateRows[rowIndex];
  if (!row) return "";
  const existing = notes
    .map((n) => n.content ?? "")
    .map((c) => parseTemplateRowStored(c))
    .find((p) => p?.rowIndex === rowIndex);
  if (existing == null) return "";
  return stripRepeatedTemplateLabelPrefix(row, existing.value);
}

/** Stored note format for scope-of-work template rows. */
export function buildTemplateRowNote(rowIndex: number, rowLabel: string, userBody: string): string {
  const cleanLabel = rowLabel.replace(/\s*:\s*$/, "").trim();
  const value = stripRepeatedTemplateLabelPrefix(rowLabel, userBody);
  return `[[TEMPLATE_ROW_${rowIndex + 1}]] ${cleanLabel}: ${value}`;
}

export function stripTemplateRowMarker(content: string): string {
  return content.replace(/^\[\[TEMPLATE_ROW_\d+\]\]\s*/, "");
}

export function parseTemplateRowStored(content: string): { rowIndex: number; value: string } | null {
  const match = content.match(/^\[\[TEMPLATE_ROW_(\d+)\]\]\s*(.*)$/);
  if (!match) return null;
  const rowIndex = Number(match[1]) - 1;
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
  return { rowIndex, value: (match[2] ?? "").trim() };
}

/** Plain text shown in thread / export when template rows are known. */
export function formatTemplateNoteBodyForDisplay(
  stored: string | null,
  templateRows: string[],
): string {
  if (!stored) return "";
  const parsed = parseTemplateRowStored(stored);
  if (!parsed || templateRows.length === 0) return stripTemplateRowMarker(stored).trim();
  const rowLabel = templateRows[parsed.rowIndex];
  if (!rowLabel) return stripTemplateRowMarker(stored).trim();
  return stripRepeatedTemplateLabelPrefix(rowLabel, parsed.value);
}

/**
 * Same as display formatting, but keeps one `Field: answer` line for scope-of-work rows
 * so clipboard export and translation preserve which template line each note belongs to.
 */
export function formatTemplateNoteBodyForExport(
  stored: string | null,
  templateRows: string[],
): string {
  if (!stored) return "";
  const parsed = parseTemplateRowStored(stored);
  if (!parsed || templateRows.length === 0) return stripTemplateRowMarker(stored).trim();
  const rowLabel = templateRows[parsed.rowIndex];
  if (!rowLabel) return stripTemplateRowMarker(stored).trim();
  const cleanLabel = rowLabel.replace(/\s*:\s*$/, "").trim();
  const body = stripRepeatedTemplateLabelPrefix(rowLabel, parsed.value);
  if (!cleanLabel) return body;
  if (!body) return `${cleanLabel}:`;
  return `${cleanLabel}: ${body}`;
}
