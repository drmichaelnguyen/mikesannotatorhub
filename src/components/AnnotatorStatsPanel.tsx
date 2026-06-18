"use client";

import { useState } from "react";
import type { AnnotatorCompensationSummary } from "@/app/actions/cases";
import { CaseDetailLink } from "@/components/CaseDetailLink";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function formatMonthLabel(lang: Lang, monthKey: string) {
  const [y, m] = monthKey.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function AnnotatorStatsPanel({
  lang,
  summary,
}: {
  lang: Lang;
  summary: AnnotatorCompensationSummary;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const fmt = (n: number) => formatCompensationAmount(lang, n);
  const fmtRating = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)} / 5`);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);

  function toggleMonth(monthKey: string) {
    setExpandedMonthKey((current) => (current === monthKey ? null : monthKey));
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 text-lg font-medium">{tk("dash_compensation")}</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">{tk("dash_period_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_this_month")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(summary.thisMonth)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_past")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(summary.priorMonths)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_all_time")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(summary.allTime)}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_base_compensation")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(summary.baseAllTime)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_bonus_compensation")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(summary.bonusAllTime)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_cases_done")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.auditedCount}</p>
          </div>
        </div>

        <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
            {tk("dash_comp_history")}
          </summary>
          <div className="border-t border-[var(--border)] p-3">
            <p className="mb-2 text-xs text-[var(--muted)]">{tk("dash_comp_month_hint")}</p>
            {summary.history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("dash_no_projects")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                      <th className="py-1.5 pr-2 font-medium">{tk("dash_month")}</th>
                      <th className="py-1.5 pr-2 font-medium">{tk("dash_audited_cases")}</th>
                      <th className="py-1.5 pr-2 font-medium">{tk("dash_base_compensation")}</th>
                      <th className="py-1.5 pr-2 font-medium">{tk("dash_bonus_compensation")}</th>
                      <th className="py-1.5 font-medium">{tk("dash_project_total")}</th>
                    </tr>
                  </thead>
                  {summary.history.map((row) => {
                    const isExpanded = expandedMonthKey === row.monthKey;
                    return (
                      <tbody key={row.monthKey}>
                        <tr
                          className={`cursor-pointer border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)] ${
                            isExpanded ? "bg-[var(--bg)]" : ""
                          }`}
                          onClick={() => toggleMonth(row.monthKey)}
                        >
                          <td className="py-1.5 pr-2 text-[var(--text)]">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden className="text-[var(--muted)]">
                                {isExpanded ? "▾" : "▸"}
                              </span>
                              {formatMonthLabel(lang, row.monthKey)}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                            {row.auditedCount}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                            {fmt(row.baseCompensation)}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                            {fmt(row.bonusCompensation)}
                          </td>
                          <td className="py-1.5 tabular-nums text-[var(--text)]">
                            {fmt(row.totalCompensation)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="bg-[var(--bg)] px-2 pb-3 pt-1">
                              <table className="w-full min-w-[560px] text-left text-xs">
                                <thead>
                                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                                    <th className="py-1 pr-2 font-medium">{tk("dash_project_col")}</th>
                                    <th className="py-1 pr-2 font-medium">{tk("col_case_id")}</th>
                                    <th className="py-1 pr-2 font-medium">{tk("col_submittedAt")}</th>
                                    <th className="py-1 pr-2 font-medium">{tk("dash_base_compensation")}</th>
                                    <th className="py-1 pr-2 font-medium">{tk("dash_bonus_compensation")}</th>
                                    <th className="py-1 font-medium">{tk("dash_project_total")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.cases.map((c) => (
                                    <tr
                                      key={c.caseDbId}
                                      className="border-b border-[var(--border)]/40 last:border-0"
                                    >
                                      <td className="py-1 pr-2 text-[var(--text)]">{c.project}</td>
                                      <td className="py-1 pr-2" onClick={(e) => e.stopPropagation()}>
                                        <CaseDetailLink caseDbId={c.caseDbId}>{c.caseId}</CaseDetailLink>
                                      </td>
                                      <td className="py-1 pr-2 whitespace-nowrap text-[var(--muted)]">
                                        {formatDate(lang, c.submittedAt)}
                                      </td>
                                      <td className="py-1 pr-2 tabular-nums">{fmt(c.baseCompensation)}</td>
                                      <td className="py-1 pr-2 tabular-nums">{fmt(c.bonusCompensation)}</td>
                                      <td className="py-1 tabular-nums">{fmt(c.totalCompensation)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </div>
        </details>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">{tk("dash_ratings")}</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">{tk("dash_ratings_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_avg_difficulty")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtRating(summary.averageDifficulty)}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {summary.difficultyCount} {tk("dash_rating_count")}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">{tk("dash_avg_quality")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtRating(summary.averageQuality)}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {summary.qualityCount} {tk("dash_rating_count")}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">{tk("dash_projects")}</h2>
        {summary.projects.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{tk("dash_no_projects")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">{tk("dash_project_col")}</th>
                  <th className="px-3 py-2 font-medium">{tk("dash_audited_cases")}</th>
                  <th className="px-3 py-2 font-medium">{tk("dash_base_compensation")}</th>
                  <th className="px-3 py-2 font-medium">{tk("dash_bonus_compensation")}</th>
                  <th className="px-3 py-2 font-medium">{tk("dash_project_total")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.projects.map((p) => (
                  <tr key={p.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text)]">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{p.auditedCount}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(p.baseCompensation)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(p.bonusCompensation)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(p.totalCompensation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
