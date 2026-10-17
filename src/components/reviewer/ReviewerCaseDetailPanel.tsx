"use client";

import { memo, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCompleteCaseAction, deleteCaseAction, unassignCaseAction } from "@/app/actions/cases";
import { CaseKeyImagesSection } from "@/components/CaseKeyImagesSection";
import { CaseStudyHistorySection } from "@/components/CaseStudyHistorySection";
import { RadiologistFindingSection } from "@/components/RadiologistFindingSection";
import { CaseContinuityReportSection } from "@/components/CaseContinuityReportSection";
import { CaseDiscussion } from "@/components/CaseDiscussion";
import { CaseDetailLink } from "@/components/CaseDetailLink";
import { CommentBodyWithVideos } from "@/components/CommentBodyWithVideos";
import { CaseVideoGuidesSection } from "@/components/CaseVideoGuides";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ReviewCasePanel } from "@/components/ReviewCasePanel";
import { RichTextContent } from "@/components/RichTextContent";
import { LoadingProgressBar } from "@/components/LoadingProgressBar";
import { ReviewerAssignCase } from "@/components/ReviewerAssignCase";
import { ReviewerCaseEditor } from "@/components/reviewer/ReviewerCaseEditor";
import { RerateQualityPanel } from "@/components/reviewer/RerateQualityPanel";
import { StarRating } from "@/components/StarRating";
import { CaseCompensationAmountButton } from "@/components/CaseCompensationBreakdown";
import { CaseDetailTabs, initialCaseDetailTab, type CaseDetailTab } from "@/components/CaseDetailTabs";
import {
  AnnotatorCasePayProspectCard,
  buildAnnotatorCasePayProspect,
} from "@/components/annotator/AnnotatorCasePayProspect";
import { computeCompensation, caseRushForfeitReason, caseRushPercent } from "@/lib/compensation";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { SerializedCaseTopic, SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";
import type { GuideOptionLite, TopicOptionLite } from "@/lib/guide-topic";
import { CaseStatus, type CompensationType } from "@prisma/client";
import { parseCommentChoiceMode, parseCommentChoices } from "@/lib/comment-choices";
import { TopicDetailModal } from "@/components/TopicDetailModal";
import type { ReferenceCaseLinkRow } from "@/components/annotator/AnnotatorCaseDetailPanel";
import { useGuideHtml } from "@/lib/use-guide-html";

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

function htmlToPlainText(html: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").trim();
}

function ReviewerDeleteCase({
  lang,
  caseDbId,
  onDeleted,
}: {
  lang: Lang;
  caseDbId: string;
  onDeleted?: () => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-3 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-3">
      <p className="mb-2 text-sm font-medium text-[var(--danger)]">{tk("reviewer_delete_case")}</p>
      <p className="mb-2 text-xs text-[var(--muted)]">{tk("reviewer_delete_case_help")}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(tk("reviewer_delete_case_confirm"))) return;
          start(async () => {
            setErr(null);
            const res = await deleteCaseAction(caseDbId);
            if (!res.ok) {
              setErr(
                res.error === "state" ? tk("reviewer_delete_case_taken") : tk("required"),
              );
              return;
            }
            onDeleted?.();
            router.refresh();
          });
        }}
        className="rounded-md border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-50"
      >
        {tk("reviewer_delete_case")}
      </button>
      {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}

function ReviewerUnassignCase({
  lang,
  caseDbId,
}: {
  lang: Lang;
  caseDbId: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <p className="mb-2 text-sm font-medium">{tk("reviewer_unassign_heading")}</p>
      <p className="mb-2 text-xs text-[var(--muted)]">{tk("reviewer_unassign_help")}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const res = await unassignCaseAction(caseDbId);
            if (!res.ok) {
              setErr(tk("required"));
              return;
            }
            router.refresh();
          })
        }
        className="rounded-md border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-50"
      >
        {tk("reviewer_unassign_submit")}
      </button>
      {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}

function ReviewerAdminCompleteCase({
  lang,
  caseDbId,
}: {
  lang: Lang;
  caseDbId: string;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(tk("reviewer_admin_complete_confirm"))) return;
          start(async () => {
            setErr(null);
            const res = await adminCompleteCaseAction(caseDbId);
            if (!res.ok) {
              setErr(
                res.error === "state" ? tk("reviewer_admin_complete_taken") : tk("required"),
              );
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50"
      >
        {tk("reviewer_admin_complete")}
      </button>
      {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}

function ReviewerCaseDetailPanelImpl({
  lang,
  c,
  annotators,
  guides = [],
  scopeOptions = [],
  projectOptions = [],
  rbProjectOptions = [],
  mentionOptions = [],
  topics = [],
  referenceCases = [],
  /** Scope-of-work checklist text; used to label template-row notes in discussion export only. */
  scopeOfWorkTemplate = null,
  commentChoiceMode = "FREE",
  commentChoicesText = "",
  commentFieldConfigs = "[]",
  onDeleted,
}: {
  lang: Lang;
  c: SerializedReviewerCase;
  annotators: { id: string; name: string; email: string }[];
  guides?: GuideOptionLite[];
  scopeOptions?: string[];
  projectOptions?: string[];
  rbProjectOptions?: string[];
  mentionOptions?: MentionOption[];
  topics?: TopicOptionLite[];
  referenceCases?: ReferenceCaseLinkRow[];
  scopeOfWorkTemplate?: string | null;
  commentChoiceMode?: string | null;
  commentChoicesText?: string | null;
  commentFieldConfigs?: string | null;
  onDeleted?: () => void;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [topicModal, setTopicModal] = useState<SerializedCaseTopic | null>(null);
  const showAuditedInfo =
    c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED;
  const rushPercent = caseRushPercent(c);
  const rushForfeit = caseRushForfeitReason(c);
  const payProspect = buildAnnotatorCasePayProspect({
    fiveStarBonusPercent: c.fiveStarBonusPercent,
    compensationType: c.compensationType,
    compensationAmount: c.compensationAmount,
    minMinutesPerCase: c.minMinutesPerCase,
    maxMinutesPerCase: c.maxMinutesPerCase,
    wasResubmitted: c.wasResubmitted,
    rushPercent,
  });
  const earned = computeCompensation(
    c.compensationType,
    c.compensationAmount,
    c.annotationMinutes,
    c.maxMinutesPerCase,
    c.minMinutesPerCase,
    c.annotatorBonus,
    rushPercent,
  );
  /** Guide body is fetched on demand so case lists stay lightweight. */
  const { html: guideHtml, loading: guideLoading } = useGuideHtml(c.guide?.id);
  const guideGuideline = useMemo(
    () => (guideHtml ? htmlToPlainText(guideHtml) : ""),
    [guideHtml],
  );
  const showGuideline = !c.guide || c.guideline.trim() !== guideGuideline;
  const detailTabs: CaseDetailTab[] = [
    {
      id: "pay",
      label: tk("detail_tab_pay"),
      badge: c.isReference
        ? undefined
        : formatCompensationAmount(lang, payProspect.maximumPotentialPay),
      content: c.isReference ? (
        <p className="text-sm text-[var(--muted)]">{tk("detail_tab_pay_reference")}</p>
      ) : (
        <AnnotatorCasePayProspectCard
          lang={lang}
          prospect={payProspect}
          rushForfeitReason={rushForfeit}
          subtitle={tk("detail_tab_pay_settled")}
        />
      ),
    },
    {
      id: "history",
      label: tk("detail_tab_history"),
      content: <CaseStudyHistorySection lang={lang} caseDbId={c.id} />,
    },
    {
      id: "finding",
      label: tk("detail_tab_finding"),
      content:
        c.radiologistFinding.trim() === "" ? (
          <p className="text-sm text-[var(--muted)]">{tk("detail_tab_finding_empty")}</p>
        ) : (
          <RadiologistFindingSection lang={lang} caseDbId={c.id} text={c.radiologistFinding} />
        ),
    },
    {
      id: "discussion",
      label: tk("detail_tab_discussion"),
      badge: c.caseNoteCount > 0 ? String(c.caseNoteCount) : undefined,
      content: (
        <div className="space-y-3">
          {c.reviews[0]?.comment && c.status !== CaseStatus.SUBMITTED && (
            <div className="text-sm text-[var(--muted)]">
              <span className="font-medium">{tk("last_review")}:</span>
              <CommentBodyWithVideos
                lang={lang}
                text={c.reviews[0].comment}
                className="mt-1 text-[var(--text)]"
              />
            </div>
          )}
          <CaseDiscussion
            lang={lang}
            caseDbId={c.id}
            caseLabel={c.caseId}
            canPost
            mentionOptions={mentionOptions}
            composerTemplate={!c.isReference ? scopeOfWorkTemplate : null}
            commentChoiceMode={!c.isReference ? parseCommentChoiceMode(commentChoiceMode) : "FREE"}
            commentChoices={!c.isReference ? parseCommentChoices(commentChoicesText) : []}
            commentFieldConfigs={!c.isReference ? commentFieldConfigs ?? "[]" : "[]"}
          />
        </div>
      ),
    },
    {
      id: "images",
      label: tk("detail_tab_images"),
      badge: c.keyImageCount > 0 ? String(c.keyImageCount) : undefined,
      content: (
        <CaseKeyImagesSection
          lang={lang}
          caseDbId={c.id}
          hasKeyImages={c.hasKeyImages}
          keyImageCount={c.keyImageCount}
        />
      ),
    },
  ];
  if (showGuideline && c.guideline.trim() !== "") {
    detailTabs.push({
      id: "guideline",
      label: tk("case_guideline"),
      content: (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">{c.guideline}</div>
      ),
    });
  }
  if (c.scopeOfWork.trim() !== "") {
    detailTabs.push({
      id: "scope",
      label: tk("case_scope"),
      content: <div className="whitespace-pre-wrap text-sm text-[var(--text)]">{c.scopeOfWork}</div>,
    });
  }
  if (c.guide) {
    detailTabs.push({
      id: "guide",
      label: tk("case_guide"),
      content: (
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--text)]">{c.guide.title}</p>
          {guideLoading ? (
            <div className="overflow-hidden rounded-md border border-[var(--border)]">
              <LoadingProgressBar />
              <p className="px-3 py-4 text-sm text-[var(--muted)]">{tk("ui_loading")}</p>
            </div>
          ) : (
            <RichTextContent html={guideHtml} />
          )}
        </div>
      ),
    });
  }
  if (c.videoGuideUrls.length > 0) {
    detailTabs.push({
      id: "videos",
      label: tk("case_videos"),
      badge: String(c.videoGuideUrls.length),
      content: <CaseVideoGuidesSection lang={lang} urls={c.videoGuideUrls} />,
    });
  }
  if (c.hasContinuityReport) {
    detailTabs.push({
      id: "continuity",
      label: tk("case_continuity_report"),
      content: <CaseContinuityReportSection lang={lang} caseDbId={c.id} hasContinuityReport />,
    });
  }
  if (c.topics.length > 0) {
    detailTabs.push({
      id: "topics",
      label: tk("case_topic"),
      badge: String(c.topics.length),
      content: (
        <div className="flex flex-wrap gap-2">
          {c.topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => setTopicModal(topic)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-left text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {topic.name}
            </button>
          ))}
        </div>
      ),
    });
  }
  if (referenceCases.length > 0) {
    detailTabs.push({
      id: "references",
      label: tk("case_reference_same_scope"),
      badge: String(referenceCases.length),
      content: (
        <div className="flex flex-wrap gap-2">
          {referenceCases.map((referenceCase) => (
            <CaseDetailLink
              key={referenceCase.id}
              caseDbId={referenceCase.id}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
            >
              <span className="font-mono font-medium">{referenceCase.caseId}</span>
              <span className="max-w-[12rem] truncate text-xs text-[var(--muted)]">
                {referenceCase.redbrickProject}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {tk("case_reference_new_tab")}
              </span>
            </CaseDetailLink>
          ))}
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{c.caseId}</h2>
            <CopyTextButton lang={lang} value={c.caseId} />
          </div>
          <p className="text-sm text-[var(--muted)]">
            {c.project}
            {c.project && c.redbrickProject ? " · " : ""}
            {c.redbrickProject}
          </p>
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
      <CaseDetailTabs
        key={c.id}
        caseDbId={c.id}
        defaultTab={initialCaseDetailTab(c.radiologistFinding.trim() !== "")}
        tabs={detailTabs}
      />
      <dl className="grid gap-2 text-sm md:grid-cols-2">
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
          <dt className="text-[var(--muted)]">{tk("case_deadline")}</dt>
          <dd>{formatDate(lang, c.deadline)}</dd>
          <dt className="text-[var(--muted)]">{tk("case_expiry")}</dt>
          <dd>{formatDate(lang, c.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_rush_bonus")}</dt>
          <dd>
            {rushPercent > 0
              ? tk("case_rush_bonus_value").replace("{percent}", String(rushPercent))
              : tk("case_rush_none")}
          </dd>
          {rushForfeit === "rejected" && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_rush_forfeit_rejected")}</p>
          )}
          {rushForfeit === "late" && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_rush_forfeit_late")}</p>
          )}
        </div>
        <div>
          <dt className="text-[var(--muted)]">{tk("case_quality_adjustment")}</dt>
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
              <dd>
                <CaseCompensationAmountButton
                  lang={lang}
                  amount={earned}
                  inputs={{
                    compensationType: c.compensationType,
                    compensationAmount: c.compensationAmount,
                    annotationMinutes: c.annotationMinutes,
                    minMinutesPerCase: c.minMinutesPerCase,
                    maxMinutesPerCase: c.maxMinutesPerCase,
                    annotatorBonus: c.annotatorBonus,
                    wasResubmitted: c.wasResubmitted,
                    rushPercent,
                    rushForfeitReason: rushForfeit,
                  }}
                  title={c.caseId}
                  className="font-medium text-[var(--success)]"
                />
              </dd>
            </div>
          </>
        )}
      </dl>
      {showAuditedInfo && (
        <RerateQualityPanel
          lang={lang}
          caseDbId={c.id}
          currentRating={c.qualityRating}
          compensationType={c.compensationType}
          compensationAmount={c.compensationAmount}
          annotationMinutes={c.annotationMinutes}
          minMinutesPerCase={c.minMinutesPerCase}
          maxMinutesPerCase={c.maxMinutesPerCase}
          wasResubmitted={c.wasResubmitted}
          rushPercent={rushPercent}
          fiveStarBonusPercent={c.fiveStarBonusPercent ?? 15}
        />
      )}
      <ReviewerCaseEditor
        lang={lang}
        c={c}
        guides={guides}
        topics={topics}
        scopeOptions={scopeOptions}
        projectOptions={projectOptions}
        rbProjectOptions={rbProjectOptions}
      />
      {c.status === CaseStatus.AVAILABLE && !c.annotator && (
        <>
          <ReviewerAssignCase lang={lang} caseDbId={c.id} annotators={annotators} />
          <ReviewerDeleteCase lang={lang} caseDbId={c.id} onDeleted={onDeleted} />
        </>
      )}
      {(c.status === CaseStatus.AVAILABLE ||
        c.status === CaseStatus.ASSIGNED ||
        c.status === CaseStatus.REJECTED) &&
        !c.isReference && <ReviewerAdminCompleteCase lang={lang} caseDbId={c.id} />}
      {c.annotator &&
        c.status !== CaseStatus.AUDITED &&
        c.status !== CaseStatus.ACCEPTED &&
        c.status !== CaseStatus.ADMIN_COMPLETED && (
        <ReviewerUnassignCase lang={lang} caseDbId={c.id} />
      )}
      {c.status === CaseStatus.SUBMITTED && (
        <div className="border-t border-[var(--border)] pt-4">
          <h4 className="mb-2 font-medium">{tk("reviewer_audit_title")}</h4>
          <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_audit_intro")}</p>
          <ReviewCasePanel
            fiveStarBonusPercent={c.fiveStarBonusPercent}
            lang={lang}
            caseDbId={c.id}
            compensationType={c.compensationType}
            compensationAmount={c.compensationAmount}
            annotationMinutes={c.annotationMinutes}
            minMinutesPerCase={c.minMinutesPerCase}
            maxMinutesPerCase={c.maxMinutesPerCase}
            wasResubmitted={c.wasResubmitted}
            rushPercent={rushPercent}
          />
        </div>
      )}
      <TopicDetailModal lang={lang} topic={topicModal} onClose={() => setTopicModal(null)} />
    </div>
  );
}

export const ReviewerCaseDetailPanel = memo(ReviewerCaseDetailPanelImpl);
