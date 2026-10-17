"use client";

import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function CaseContinuityReportSection({
  lang,
  caseDbId,
  hasContinuityReport,
}: {
  lang: Lang;
  caseDbId: string;
  hasContinuityReport: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  if (!hasContinuityReport) return null;

  const reportUrl = `/api/cases/${caseDbId}/continuity-report`;

  return (
    <div className="space-y-2">
      <a
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface)]"
      >
        {tk("case_continuity_report_open_tab")}
      </a>
      <iframe
        title={tk("case_continuity_report")}
        src={reportUrl}
        className="min-h-[70vh] w-full rounded-md border border-[var(--border)] bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
