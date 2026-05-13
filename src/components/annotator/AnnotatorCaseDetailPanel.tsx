"use client";

import { CaseDiscussion } from "@/components/CaseDiscussion";
import { TopicDetailModal } from "@/components/TopicDetailModal";
import { CaseVideoGuidesSection } from "@/components/CaseVideoGuides";
import { CopyTextButton } from "@/components/CopyTextButton";
import { RichTextContent } from "@/components/RichTextContent";
import { StarRating } from "@/components/StarRating";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SerializedCaseTopic } from "@/lib/reviewer-serialize";
import type { GuideOption, MentionOption } from "@/lib/guide-topic";
import { videoGuideUrlsFromDb } from "@/lib/video-guides";
import type { AnnotationCase, CompensationType, Review } from "@prisma/client";
import { CaseStatus } from "@prisma/client";
import { useMemo, useState } from "react";

export type AnnotatorCaseRow = AnnotationCase & {
  guide: { id: string; title: string } | null;
  topics: SerializedCaseTopic[];
  reviews?: Pick<Review, "id" | "decision" | "comment" | "createdAt">[];
  _count?: { caseNotes: number };
  auditedBy?: { id: string; name: string; email: string } | null;
  /** Optional template to prefill the annotator composer based on `scopeOfWork`. */
  scopeOfWorkTemplate?: string | null;
};

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

function htmlToPlainText(html: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

export function AnnotatorCaseDetailPanel({
  lang,
  row,
  canPostDiscussion,
  guides = [],
  mentionOptions = [],
}: {
  lang: Lang;
  row: AnnotatorCaseRow;
  canPostDiscussion: boolean;
  guides?: GuideOption[];
  mentionOptions?: MentionOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const last = row.reviews?.[0];
  const showAuditedInfo =
    row.status === CaseStatus.AUDITED || row.status === CaseStatus.ACCEPTED;
  const earned = computeCompensation(
    row.compensationType,
    row.compensationAmount,
    row.annotationMinutes,
    row.maxMinutesPerCase,
    row.annotatorBonus,
  );
  const guideHtml = useMemo(() => {
    if (!row.guide) return "";
    return guides.find((g) => g.id === row.guide!.id)?.content ?? "";
  }, [guides, row.guide]);
  const guideGuideline = useMemo(
    () => (guideHtml ? htmlToPlainText(guideHtml) : ""),
    [guideHtml],
  );
  const showGuideline = !row.guide || row.guideline.trim() !== guideGuideline;
  const videoUrls = videoGuideUrlsFromDb(row.videoGuideUrls);
  const [topicModal, setTopicModal] = useState<SerializedCaseTopic | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{row.caseId}</h2>
            <CopyTextButton lang={lang} value={row.caseId} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>{row.redbrickProject}</span>
            <CopyTextButton lang={lang} value={row.redbrickProject} />
          </div>
          {row.isReference && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-yellow-500 bg-yellow-300 px-2 py-0.5 text-xs font-semibold text-yellow-950">
              <span aria-hidden>★</span>
              <span>{tk("case_reference")}</span>
            </span>
          )}
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
          {tk(`status_${row.status}` as DictKey)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        {row.guide && (
          <div className="md:col-span-2">
            <dt className="sr-only">{tk("case_guide")}</dt>
            <dd className="m-0">
              <details className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
                <summary className="cursor-pointer px-3 py-2 text-sm hover:bg-[var(--surface)]">
                  <span className="text-[var(--muted)]">{tk("case_guide")}: </span>
                  <span className="font-medium text-[var(--text)]">{row.guide.title}</span>
                </summary>
                <div className="border-t border-[var(--border)] px-3 py-3">
                  <RichTextContent html={guideHtml} />
                </div>
              </details>
            </dd>
          </div>
        )}
        <CaseVideoGuidesSection lang={lang} urls={videoUrls} />
        {showGuideline && row.guideline.trim() !== "" && (
          <div className="md:col-span-2">
            <dt className="sr-only">{tk("case_guideline")}</dt>
            <dd className="m-0">
              <details className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)]">
                  {tk("case_guideline")}
                </summary>
                <div className="border-t border-[var(--border)] px-3 py-2 text-sm whitespace-pre-wrap text-[var(--text)]">
                  {row.guideline}
                </div>
              </details>
            </dd>
          </div>
        )}
        {row.topics.length > 0 && (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">{tk("case_topic")}</dt>
            <dd className="flex flex-wrap gap-2">
              {row.topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopicModal(topic)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-left text-sm font-medium text-[var(--accent)] underline-offset-2 hover:bg-[var(--surface)] hover:underline"
                >
                  {topic.name}
                </button>
              ))}
            </dd>
          </div>
        )}
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">{tk("case_scope")}</dt>
          <dd>{row.scopeOfWork}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_minMinutes_recommended")}</dt>
          <dd>{row.minMinutesPerCase}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_maxMinutes")}</dt>
          <dd>{row.maxMinutesPerCase}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_compAmount")}</dt>
          <dd>{compLabel(lang, row.compensationType, row.compensationAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_annotatorBonus")}</dt>
          <dd>{row.annotatorBonus}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_assignedAt")}</dt>
          <dd>{formatDate(lang, row.assignedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_completedAt")}</dt>
          <dd>{formatDate(lang, row.completedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_annotationMinutes")}</dt>
          <dd>{row.annotationMinutes ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_difficultyRating")}</dt>
          <dd>
            {row.difficultyRating == null ? (
              "—"
            ) : (
              <StarRating label={tk("case_difficultyRating")} value={row.difficultyRating} />
            )}
          </dd>
        </div>
        {showAuditedInfo && (
          <>
            <div className="md:col-span-2">
              <dt className="text-[var(--muted)]">{tk("case_compensation_earned")}</dt>
              <dd className="font-medium tabular-nums text-[var(--success)]">
                {formatCompensationAmount(lang, earned)}
              </dd>
            </div>
          </>
        )}
        {row.status !== CaseStatus.SUBMITTED && (
          <>
            <div>
              <dt className="text-[var(--muted)]">{tk("case_qualityRating")}</dt>
              <dd>
                {row.qualityRating == null ? (
                  "—"
                ) : (
                  <StarRating label={tk("case_qualityRating")} value={row.qualityRating} />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">{tk("case_audited_at")}</dt>
              <dd>{formatDate(lang, row.auditedAt)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">{tk("case_audited_by")}</dt>
              <dd>
                {row.auditedBy?.name ??
                  (row.status === CaseStatus.ACCEPTED ? tk("case_audit_legacy") : "—")}
              </dd>
            </div>
          </>
        )}
      </dl>
      {last?.comment && (
        <p className="rounded-md bg-[var(--bg)] p-2 text-sm">
          <span className="font-medium text-[var(--text)]">{tk("last_review")}: </span>
          {last.comment}
        </p>
      )}
      <div>
        <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">{tk("discussion_title")}</h3>
        <CaseDiscussion
          lang={lang}
          caseDbId={row.id}
          caseLabel={row.caseId}
          canPost={canPostDiscussion}
          mentionOptions={mentionOptions}
          composerTemplate={!row.isReference ? row.scopeOfWorkTemplate ?? null : null}
          requireComposerTemplate={true}
        />
      </div>
      <TopicDetailModal lang={lang} topic={topicModal} onClose={() => setTopicModal(null)} />
    </div>
  );
}
