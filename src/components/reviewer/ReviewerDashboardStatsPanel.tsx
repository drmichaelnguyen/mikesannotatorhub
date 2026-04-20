import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function fmtRating(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)} / 5`;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function ReviewerDashboardStatsPanel({
  lang,
  totalAnnotators,
  caseDone,
  caseSubmittedPendingReview,
  caseApproved,
  averageDifficulty,
  difficultyCount,
  averageQuality,
  qualityCount,
}: {
  lang: Lang;
  totalAnnotators: number;
  caseDone: number;
  caseSubmittedPendingReview: number;
  caseApproved: number;
  averageDifficulty: number | null;
  difficultyCount: number;
  averageQuality: number | null;
  qualityCount: number;
}) {
  const tk = (k: DictKey) => t(lang, k);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{tk("reviewer_dashboard_cards")}</h2>
      <p className="text-xs text-[var(--muted)]">{tk("reviewer_dashboard_cards_hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/reviewer?annotators=1"
          className="block rounded-xl outline-none ring-offset-2 ring-offset-[var(--bg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <StatCard
            label={tk("reviewer_all_annotators")}
            value={String(totalAnnotators)}
            hint={tk("reviewer_perf_open_annotator")}
          />
        </Link>
        <StatCard label={tk("reviewer_cases_done")} value={String(caseDone)} />
        <StatCard
          label={tk("reviewer_cases_submitted_pending")}
          value={String(caseSubmittedPendingReview)}
        />
        <StatCard label={tk("reviewer_cases_approved")} value={String(caseApproved)} />
        <StatCard
          label={tk("dash_avg_difficulty")}
          value={fmtRating(averageDifficulty)}
          hint={`${difficultyCount} ${tk("dash_rating_count")}`}
        />
        <StatCard
          label={tk("dash_avg_quality")}
          value={fmtRating(averageQuality)}
          hint={`${qualityCount} ${tk("dash_rating_count")}`}
        />
      </div>
    </section>
  );
}
