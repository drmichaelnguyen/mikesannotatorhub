"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resolveRedbrickFlagAction, type ReviewerRedbrickFlagRow } from "@/app/actions/redbrick-flags";
import { CaseDetailLink } from "@/components/CaseDetailLink";
import { formatDate } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function ReviewerFlaggedCasesPanel({
  lang,
  flags,
}: {
  lang: Lang;
  flags: ReviewerRedbrickFlagRow[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [pending, start] = useTransition();

  if (flags.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{tk("redbrick_flags_empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
            <th className="py-2 pr-3 font-medium">{tk("col_case_id")}</th>
            <th className="py-2 pr-3 font-medium">{tk("col_redbrick")}</th>
            <th className="py-2 pr-3 font-medium">{tk("case_scope")}</th>
            <th className="py-2 pr-3 font-medium">{tk("case_status")}</th>
            <th className="py-2 pr-3 font-medium">{tk("redbrick_flag_reported_by")}</th>
            <th className="py-2 pr-3 font-medium">{tk("redbrick_flag_comment")}</th>
            <th className="py-2 pr-3 font-medium">{tk("redbrick_flag_reported_at")}</th>
            <th className="py-2 font-medium">{tk("col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <tr key={flag.id} className="border-b border-[var(--border)]/50 align-top">
              <td className="py-2 pr-3 font-mono font-medium">
                <CaseDetailLink
                  caseDbId={flag.caseDbId}
                  amendSearch={(p) => p.delete("annotators")}
                  className="text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  {flag.caseId}
                </CaseDetailLink>
              </td>
              <td className="py-2 pr-3 text-[var(--muted)]">{flag.redbrickProject}</td>
              <td className="py-2 pr-3 max-w-[12rem] truncate" title={flag.scopeOfWork}>
                {flag.scopeOfWork}
              </td>
              <td className="py-2 pr-3">
                <div>{tk(`status_${flag.hubStatus}` as DictKey)}</div>
                {flag.hubAnnotatorName && (
                  <div className="text-xs text-[var(--muted)]">{flag.hubAnnotatorName}</div>
                )}
              </td>
              <td className="py-2 pr-3">
                <div>{flag.flaggedByName}</div>
                <div className="text-xs text-[var(--muted)]">{flag.flaggedByEmail}</div>
              </td>
              <td className="py-2 pr-3 max-w-[14rem] whitespace-pre-wrap text-[var(--muted)]">
                {flag.comment?.trim() || "—"}
              </td>
              <td className="py-2 pr-3 text-[var(--muted)]">{formatDate(lang, flag.createdAt)}</td>
              <td className="py-2">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded border border-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 text-[var(--success)] hover:bg-[var(--success)]/20 disabled:opacity-50"
                  onClick={() =>
                    start(async () => {
                      await resolveRedbrickFlagAction(flag.id);
                      router.refresh();
                    })
                  }
                >
                  {tk("redbrick_flag_mark_checked")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
