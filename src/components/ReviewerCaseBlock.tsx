import { CaseDiscussion } from "@/components/CaseDiscussion";
import { ReviewCasePanel } from "@/components/ReviewCasePanel";
import { ReviewerAssignCase } from "@/components/ReviewerAssignCase";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus, type AnnotationCase, type CaseNote, type CompensationType, type Review, type User } from "@prisma/client";

export type ReviewerCaseRow = AnnotationCase & {
  annotator: User | null;
  auditedBy: Pick<User, "id" | "name" | "email"> | null;
  reviews: Review[];
  caseNotes: (CaseNote & { author: Pick<User, "id" | "name" | "role"> })[];
};

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

export function ReviewerCaseBlock({
  lang,
  c,
  annotators,
}: {
  lang: Lang;
  c: ReviewerCaseRow;
  annotators: { id: string; name: string; email: string }[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const showAuditedInfo =
    c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED;
  const earned = computeCompensation(
    c.compensationType,
    c.compensationAmount,
    c.annotationMinutes,
  );

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-medium">{c.caseId}</h3>
          <p className="text-sm text-[var(--muted)]">{c.redbrickProject}</p>
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
          {tk(`status_${c.status}` as DictKey)}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">{tk("case_guideline")}</dt>
          <dd>{c.guideline}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">{tk("case_scope")}</dt>
          <dd>{c.scopeOfWork}</dd>
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
      <CaseDiscussion
        lang={lang}
        caseDbId={c.id}
        canPost
        notes={c.caseNotes.map((n) => ({
          id: n.id,
          content: n.content,
          imageData: n.imageData,
          createdAt: n.createdAt.toISOString(),
          author: { name: n.author.name, role: n.author.role },
        }))}
      />
      {c.reviews[0]?.comment && c.status !== CaseStatus.SUBMITTED && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {tk("last_review")}: {c.reviews[0].comment}
        </p>
      )}
      {c.status === CaseStatus.AVAILABLE && (
        <ReviewerAssignCase lang={lang} caseDbId={c.id} annotators={annotators} />
      )}
      {c.status === CaseStatus.SUBMITTED && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <h4 className="mb-2 font-medium">{tk("reviewer_audit_title")}</h4>
          <p className="mb-3 text-xs text-[var(--muted)]">{tk("reviewer_audit_intro")}</p>
          <ReviewCasePanel lang={lang} caseDbId={c.id} />
        </div>
      )}
    </article>
  );
}
