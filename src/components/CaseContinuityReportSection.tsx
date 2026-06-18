"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  if (!hasContinuityReport) return null;

  const reportUrl = `/api/cases/${caseDbId}/continuity-report`;

  return (
    <>
      <div className="md:col-span-2">
        <dt className="sr-only">{tk("case_continuity_report")}</dt>
        <dd className="m-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
          >
            <span className="text-[var(--muted)]">{tk("case_continuity_report")}</span>
            <span className="ml-2 font-medium text-[var(--accent)]">{tk("case_continuity_report_view")}</span>
          </button>
        </dd>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tk("case_continuity_report")}
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold">{tk("case_continuity_report")}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
                >
                  {tk("case_continuity_report_open_tab")}
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--bg)]"
                >
                  {tk("drawer_close")}
                </button>
              </div>
            </div>
            <iframe
              title={tk("case_continuity_report")}
              src={reportUrl}
              className="min-h-[70vh] w-full flex-1 border-0 bg-white"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}
    </>
  );
}
