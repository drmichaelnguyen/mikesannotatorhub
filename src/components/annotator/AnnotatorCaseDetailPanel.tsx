"use client";

import { CaseDiscussion, type CaseDiscussionNote } from "@/components/CaseDiscussion";
import { CopyTextButton } from "@/components/CopyTextButton";
import { StarRating } from "@/components/StarRating";
import { getCaseNoteImages } from "@/lib/case-note-images";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount, formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";
import type { AnnotationCase, CaseNote, CompensationType, Review, User } from "@prisma/client";
import { CaseStatus } from "@prisma/client";

export type AnnotatorCaseRow = AnnotationCase & {
  guide: { id: string; redbrickProject: string; title: string; content: string } | null;
  topic:
    | { id: string; name: string; description: string | null; projects: { id: string; redbrickProject: string }[] }
    | null;
  reviews?: Review[];
  caseNotes?: (CaseNote & { author: Pick<User, "id" | "name" | "role"> })[];
  auditedBy?: { id: string; name: string; email: string } | null;
};

function toDiscussionNotes(notes: NonNullable<AnnotatorCaseRow["caseNotes"]>): CaseDiscussionNote[] {
  return notes.map((n) => ({
    id: n.id,
    parentNoteId: n.parentNoteId ?? null,
    content: n.content,
    images: getCaseNoteImages(n),
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
    author: { name: n.author.name, role: n.author.role },
  }));
}

function compLabel(lang: Lang, type: CompensationType, amount: number) {
  if (type === "PER_MINUTE") return `${amount} × ${t(lang, "comp_per_minute")}`;
  return `${amount} (${t(lang, "comp_per_case")})`;
}

export function AnnotatorCaseDetailPanel({
  lang,
  row,
  canPostDiscussion,
  mentionOptions = [],
}: {
  lang: Lang;
  row: AnnotatorCaseRow;
  canPostDiscussion: boolean;
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
  );

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
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs">
          {tk(`status_${row.status}` as DictKey)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">{tk("case_guideline")}</dt>
          <dd>{row.guideline}</dd>
        </div>
        {row.guide && (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">{tk("case_guide")}</dt>
            <dd>
              <div className="font-medium">{row.guide.title}</div>
              <div className="text-xs text-[var(--muted)]">{row.guide.redbrickProject}</div>
            </dd>
          </div>
        )}
        {row.topic && (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">{tk("case_topic")}</dt>
            <dd>
              <div className="font-medium">{row.topic.name}</div>
              <div className="text-xs text-[var(--muted)]">
                {row.topic.projects.map((p) => p.redbrickProject).join(", ") || "—"}
              </div>
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
          canPost={canPostDiscussion}
          mentionOptions={mentionOptions}
          notes={row.caseNotes ? toDiscussionNotes(row.caseNotes) : []}
        />
      </div>
    </div>
  );
}
