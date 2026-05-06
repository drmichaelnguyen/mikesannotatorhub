"use client";

import { memo, useMemo } from "react";
import { CaseDiscussion } from "@/components/CaseDiscussion";
import { CaseVideoGuidesSection } from "@/components/CaseVideoGuides";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ReviewCasePanel } from "@/components/ReviewCasePanel";
import { RichTextContent } from "@/components/RichTextContent";
import { ReviewerAssignCase } from "@/components/ReviewerAssignCase";
import { ReviewerCaseEditor } from "@/components/reviewer/ReviewerCaseEditor";
import { StarRating } from "@/components/StarRating";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";
import type { GuideOption } from "@/lib/guide-topic";
import { CaseStatus, type CompensationType } from "@prisma/client";

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

function htmlToPlainText(html: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

function ReviewerCaseDetailPanelImpl({
  lang,
  c,
  annotators,
  guides = [],
  scopeOptions = [],
  mentionOptions = [],
}: {
  lang: Lang;
  c: SerializedReviewerCase;
  annotators: { id: string; name: string; email: string }[];
  guides?: GuideOption[];
  scopeOptions?: string[];
  mentionOptions?: MentionOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const showAuditedInfo =
    c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED;
  const earned = computeCompensation(
    c.compensationType,
    c.compensationAmount,
    c.annotationMinutes,
    c.maxMinutesPerCase,
    c.annotatorBonus,
  );
  const guideGuideline = useMemo(
    () => (c.guide ? htmlToPlainText(c.guide.content) : ""),
    [c.guide],
  );
  const showGuideline = !c.guide || c.guideline.trim() !== guideGuideline;
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{c.caseId}</h2>
            <CopyTextButton lang={lang} value={c.caseId} />
          </div>
          <p className="text-sm text-[var(--muted)]">{c.redbrickProject}</p>
          {c.isReference && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-yellow-500 bg-yellow-300 px-2 py-0.5 text-xs font-semibold text-yellow-950">
              <span aria-hidden>★</span>
              <span>{tk("case_reference")}</span>
            </span>
          )}
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
          {tk(`status_${c.status}` as DictKey)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        {c.guide && (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">{tk("case_guide")}</dt>
            <dd>
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="font-medium">{c.guide.title}</div>
                <div className="mt-2">
                  <RichTextContent html={c.guide.content} />
                </div>
              </div>
            </dd>
          </div>
        )}
        <CaseVideoGuidesSection lang={lang} urls={c.videoGuideUrls} />
        {showGuideline && c.guideline.trim() !== "" && (
          <div className="md:col-span-2">
            <dt className="sr-only">{tk("case_guideline")}</dt>
            <dd className="m-0">
              <details className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]">
                  {tk("case_guideline")}
                </summary>
                <div className="border-t border-[var(--border)] px-3 py-2 text-sm whitespace-pre-wrap text-[var(--text)]">
                  {c.guideline}
                </div>
              </details>
            </dd>
          </div>
        )}
        {c.topic && (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">{tk("case_topic")}</dt>
            <dd>
              <div className="font-medium">{c.topic.name}</div>
              <div className="text-xs text-[var(--muted)]">
                {c.topic.projects.map((p) => p.redbrickProject).join(", ") || "—"}
              </div>
            </dd>
          </div>
        )}
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">{tk("case_scope")}</dt>
          <dd>{c.scopeOfWork}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_minMinutes_recommended")}</dt>
          <dd>{c.minMinutesPerCase}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_maxMinutes")}</dt>
          <dd>{c.maxMinutesPerCase}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_compAmount")}</dt>
          <dd>{compLabel(lang, c.compensationType, c.compensationAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_annotatorBonus")}</dt>
          <dd>{c.annotatorBonus}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_annotator")}</dt>
          <dd>{c.annotator?.name ?? tk("unassigned")}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_assignedAt")}</dt>
          <dd>{formatDate(lang, c.assignedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_completedAt")}</dt>
          <dd>{formatDate(lang, c.completedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_annotationMinutes")}</dt>
          <dd>{c.annotationMinutes ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_difficultyRating")}</dt>
          <dd>
            {c.difficultyRating == null ? (
              "—"
            ) : (
              <StarRating label={tk("case_difficultyRating")} value={c.difficultyRating} />
            )}
          </dd>
        </div>
        {c.qualityRating != null && (
          <div>
            <dt className="text-[var(--muted)]">{tk("case_qualityRating")}</dt>
            <dd>
              <StarRating label={tk("case_qualityRating")} value={c.qualityRating} />
            </dd>
          </div>
        )}
        {showAuditedInfo && (
          <>
            <div>
              <dt className="text-[var(--muted)]">{tk("case_audited_at")}</dt>
              <dd>{formatDate(lang, c.auditedAt)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">{tk("case_audited_by")}</dt>
              <dd>
                {c.auditedBy?.name ??
                  (c.status === CaseStatus.ACCEPTED ? tk("case_audit_legacy") : "—")}
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-[var(--muted)]">{tk("case_compensation_earned")}</dt>
              <dd className="font-medium tabular-nums text-[var(--success)]">
                {formatCompensationAmount(lang, earned)}
              </dd>
            </div>
          </>
        )}
      </dl>
      <ReviewerCaseEditor lang={lang} c={c} guides={guides} scopeOptions={scopeOptions} />
      <div>
        <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">{tk("discussion_title")}</h3>
        <CaseDiscussion
          lang={lang}
          caseDbId={c.id}
          caseLabel={c.caseId}
          canPost
          mentionOptions={mentionOptions}
        />
      </div>
      {c.reviews[0]?.comment && c.status !== CaseStatus.SUBMITTED && (
        <p className="text-sm text-[var(--muted)]">
          {tk("last_review")}: {c.reviews[0].comment}
        </p>
      )}
      {c.status === CaseStatus.AVAILABLE && (
        <ReviewerAssignCase lang={lang} caseDbId={c.id} annotators={annotators} />
      )}
      {c.status === CaseStatus.SUBMITTED && (
        <div className="border-t border-[var(--border)] pt-4">
          <h4 className="mb-2 font-medium">{tk("reviewer_audit_title")}</h4>
          <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_audit_intro")}</p>
          <ReviewCasePanel lang={lang} caseDbId={c.id} />
        </div>
      )}
    </div>
  );
}

export const ReviewerCaseDetailPanel = memo(ReviewerCaseDetailPanelImpl);
