"use client";

import { useEffect, useState } from "react";
import type { CaseStudyHistoryStage } from "@/lib/case-study-history";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type HistoryPayload = {
  found: boolean;
  studyId: string;
  redbrickStage: string;
  stages: CaseStudyHistoryStage[];
};

export function CaseStudyHistorySection({
  lang,
  caseDbId,
}: {
  lang: Lang;
  caseDbId: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`/api/cases/${caseDbId}/study-history`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<HistoryPayload>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [caseDbId]);

  if (error || !data?.found || data.stages.length === 0) return null;

  const stageCount = data.stages.length;

  return (
    <div className="md:col-span-2">
      <dt className="sr-only">{tk("case_study_history")}</dt>
      <dd className="m-0">
        <details className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]">
            {tk("case_study_history")}
            <span className="ml-2 font-normal text-[var(--text)]">
              ({stageCount} {stageCount === 1 ? tk("case_study_history_stage") : tk("case_study_history_stages")})
            </span>
          </summary>
          <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
            {data.redbrickStage.trim() !== "" && (
              <p className="text-xs text-[var(--muted)]">
                {tk("case_study_history_redbrick_stage")}:{" "}
                <span className="font-medium text-[var(--text)]">{data.redbrickStage}</span>
              </p>
            )}
            {data.stages.map((stage, idx) => (
              <div
                key={`${stage.stage}-${idx}`}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <h4 className="text-sm font-medium text-[var(--text)]">{stage.stage}</h4>
                <dl className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                  <HistoryField label={tk("case_study_history_batch")} value={stage.batchId} />
                  <HistoryField label={tk("case_study_history_annotator")} value={stage.annotator} />
                  <HistoryField
                    label={tk("case_study_history_date_assigned")}
                    value={stage.dateAssigned}
                  />
                  <HistoryField
                    label={tk("case_study_history_date_completed")}
                    value={stage.dateCompleted}
                  />
                  <HistoryField label={tk("case_study_history_status")} value={stage.status} />
                  {stage.notes.trim() !== "" && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-[var(--muted)]">{tk("case_study_history_notes")}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-[var(--text)]">{stage.notes}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </details>
      </dd>
    </div>
  );
}

function HistoryField({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--text)]">{value}</dd>
    </div>
  );
}
