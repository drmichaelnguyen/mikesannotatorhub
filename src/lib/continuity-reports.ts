import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  extractContinuityReportCaseId,
  matchContinuityReportFileToCaseId,
} from "@/lib/continuity-report-filename";

export { extractContinuityReportCaseId, matchContinuityReportFileToCaseId };

const REPORTS_DIR = path.join(process.cwd(), "uploads", "continuity-reports");

function reportPath(caseDbId: string) {
  return path.join(REPORTS_DIR, `${caseDbId}.html`);
}

export async function ensureContinuityReportsDir() {
  await mkdir(REPORTS_DIR, { recursive: true });
}

export async function saveContinuityReport(caseDbId: string, content: Buffer | string) {
  await ensureContinuityReportsDir();
  await writeFile(reportPath(caseDbId), content, "utf8");
}

export async function readContinuityReport(caseDbId: string): Promise<string | null> {
  try {
    return await readFile(reportPath(caseDbId), "utf8");
  } catch {
    return null;
  }
}

export async function deleteContinuityReport(caseDbId: string) {
  try {
    await unlink(reportPath(caseDbId));
  } catch {
    // File may already be missing.
  }
}

export type ParsedContinuityReportUpload = {
  caseId: string;
  content: string;
  filename: string;
};

export async function parseContinuityReportUploads(
  files: File[],
  caseIds: string[],
): Promise<{
  matched: ParsedContinuityReportUpload[];
  unmatchedFilenames: string[];
}> {
  const matched: ParsedContinuityReportUpload[] = [];
  const unmatchedFilenames: string[] = [];
  const usedCaseIds = new Set<string>();

  for (const file of files) {
    const caseId = matchContinuityReportFileToCaseId(file.name, caseIds);
    if (!caseId || usedCaseIds.has(caseId)) {
      unmatchedFilenames.push(file.name);
      continue;
    }
    const content = await file.text();
    if (!content.trim()) {
      unmatchedFilenames.push(file.name);
      continue;
    }
    usedCaseIds.add(caseId);
    matched.push({ caseId, content, filename: file.name });
  }

  return { matched, unmatchedFilenames };
}

export async function readContinuityReportsFromFormData(
  formData: FormData,
  caseIds: string[],
): Promise<{
  byCaseId: Map<string, string>;
  unmatchedFilenames: string[];
}> {
  const files = formData
    .getAll("continuityReports")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const { matched, unmatchedFilenames } = await parseContinuityReportUploads(files, caseIds);
  return {
    byCaseId: new Map(matched.map((row) => [row.caseId, row.content])),
    unmatchedFilenames,
  };
}
