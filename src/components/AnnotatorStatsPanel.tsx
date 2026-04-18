import type { AnnotatorCompensationSummary } from "@/app/actions/cases";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function AnnotatorStatsPanel({
  lang,
  summary,
}: {
  lang: Lang;
  summary: AnnotatorCompensationSummary;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const fmt = (n: number) => formatCompensationAmount(lang, n);

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
                  <th className="px-3 py-2 font-medium">{tk("dash_accepted_cases")}</th>
                  <th className="px-3 py-2 font-medium">{tk("dash_project_total")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.projects.map((p) => (
                  <tr key={p.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text)]">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{p.acceptedCount}</td>
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
