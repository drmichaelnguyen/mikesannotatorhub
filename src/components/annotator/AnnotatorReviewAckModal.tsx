"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { acknowledgeAnnotatorReviewAction, type PendingReviewAckCase } from "@/app/actions/cases";
import { StarRating } from "@/components/StarRating";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus } from "@prisma/client";

export function AnnotatorReviewAckModal({
  lang,
  pending,
}: {
  lang: Lang;
  pending: PendingReviewAckCase[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pendingTransition, start] = useTransition();

  const current = pending[0] ?? null;
  const total = pending.length;

  const outcomeLabel = useMemo(() => {
    if (!current) return "";
    if (current.status === CaseStatus.REJECTED || current.review.decision === "REJECT") {
      return tk("annotator_review_ack_outcome_rejected");
    }
    return tk("annotator_review_ack_outcome_audited");
  }, [current, tk]);

  const onMarkRead = useCallback(() => {
    if (!current) return;
    setErr(null);
    start(async () => {
      const res = await acknowledgeAnnotatorReviewAction(current.caseDbId);
      if (!res.ok) {
        setErr(t(lang, "required"));
        return;
      }
      router.refresh();
    });
  }, [current, lang, router]);

  if (total === 0 || !current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-[var(--text)]">{tk("annotator_review_ack_title")}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{tk("annotator_review_ack_intro")}</p>
        {total > 1 && (
          <p className="mt-3 text-xs text-[var(--muted)]">
            {tk("annotator_review_ack_remaining")}: {total}
          </p>
        )}

        <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-sm">
          <div>
            <span className="text-[var(--muted)]">{tk("case_caseId")}: </span>
            <span className="font-mono font-medium text-[var(--text)]">{current.caseId}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">{tk("case_redbrick")}: </span>
            <span className="text-[var(--text)]">{current.redbrickProject}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">{tk("annotator_review_ack_reviewed_at")}: </span>
            <span className="text-[var(--text)]">{formatDate(lang, new Date(current.review.createdAt))}</span>
          </div>
          <div className="font-medium text-[var(--text)]">{outcomeLabel}</div>
          {current.qualityRating != null && (
            <StarRating label={tk("case_qualityRating")} value={current.qualityRating} />
          )}
          {current.review.comment?.trim() ? (
            <div>
              <div className="text-xs text-[var(--muted)]">{tk("review_comment")}</div>
              <blockquote className="mt-1 whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)]">
                {current.review.comment}
              </blockquote>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">{tk("annotator_review_ack_no_comment")}</p>
          )}
        </div>

        {err && <p className="mt-3 text-sm text-[var(--danger)]">{err}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendingTransition}
            onClick={onMarkRead}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {tk("annotator_review_ack_mark_read")}
          </button>
        </div>
      </div>
    </div>
  );
}
