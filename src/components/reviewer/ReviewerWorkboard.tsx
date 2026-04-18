"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addCaseNoteAction, reviewCaseAction } from "@/app/actions/cases";
import { ReviewerCaseDetailPanel } from "@/components/reviewer/ReviewerCaseDetailPanel";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus } from "@prisma/client";

type ProjectGroup = {
  project: string;
  groups: { key: string; label: string; cases: SerializedReviewerCase[] }[];
};

function buildBoard(cases: SerializedReviewerCase[], lang: Lang): ProjectGroup[] {
  const unassignedLabel = t(lang, "group_unassigned");
  const pm = new Map<string, Map<string, SerializedReviewerCase[]>>();
  for (const c of cases) {
    const proj = (c.redbrickProject || "").trim() || "—";
    if (!pm.has(proj)) pm.set(proj, new Map());
    const am = pm.get(proj)!;
    const key = c.annotator?.id ?? "__unassigned__";
    if (!am.has(key)) am.set(key, []);
    am.get(key)!.push(c);
  }
  return [...pm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, amap]) => ({
      project,
      groups: [...amap.entries()]
        .map(([key, list]) => {
          const sorted = [...list].sort((a, b) => a.caseId.localeCompare(b.caseId));
          const label =
            key === "__unassigned__"
              ? unassignedLabel
              : sorted[0]?.annotator
                ? `${sorted[0].annotator.name} (${sorted[0].annotator.email})`
                : unassignedLabel;
          return { key, label, cases: sorted };
        })
        .sort((a, b) => {
          if (a.key === "__unassigned__") return 1;
          if (b.key === "__unassigned__") return -1;
          return a.label.localeCompare(b.label);
        }),
    }));
}

export function ReviewerWorkboard({
  lang,
  cases,
  annotators,
}: {
  lang: Lang;
  cases: SerializedReviewerCase[];
  annotators: { id: string; name: string; email: string }[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const board = useMemo(() => buildBoard(cases, lang), [cases, lang]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteCaseId, setNoteCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [audit, setAudit] = useState<{ caseId: string; decision: "ACCEPT" | "REJECT" } | null>(
    null,
  );
  const [auditComment, setAuditComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const detailCase = detailId ? cases.find((c) => c.id === detailId) ?? null : null;
  const noteCase = noteCaseId ? cases.find((c) => c.id === noteCaseId) ?? null : null;

  function refresh() {
    router.refresh();
  }

  function submitNote() {
    if (!noteCaseId) return;
    const text = noteText.trim();
    if (!text) {
      setErr(tk("discussion_need_body"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId: noteCaseId,
        content: text,
        imageData: null,
      });
      if (!res.ok) {
        setErr(tk("required"));
        return;
      }
      setNoteCaseId(null);
      setNoteText("");
      refresh();
    });
  }

  function submitAudit() {
    if (!audit) return;
    const text = auditComment.trim();
    if (audit.decision === "REJECT" && !text) {
      setErr(tk("audit_reject_need_comment"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await reviewCaseAction({
        caseDbId: audit.caseId,
        decision: audit.decision,
        comment: text,
        screenshotData: null,
      });
      if (!res.ok) {
        setErr(tk("reviewer_assign_taken"));
        return;
      }
      setAudit(null);
      setAuditComment("");
      setDetailId(null);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{tk("reviewer_board_title")}</h2>
      <p className="text-sm text-[var(--muted)]">{tk("reviewer_board_hint")}</p>

      {cases.length === 0 ? (
        <p className="text-[var(--muted)]">{tk("no_cases")}</p>
      ) : (
        <div className="space-y-2">
          {board.map((p) => (
            <details
              key={p.project}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
                {p.project}{" "}
                <span className="font-normal text-[var(--muted)]">
                  ({p.groups.reduce((n, g) => n + g.cases.length, 0)})
                </span>
              </summary>
              <div className="border-t border-[var(--border)] px-2 pb-2 pt-1">
                {p.groups.map((g) => (
                  <details key={g.key} className="mb-2 rounded-md border border-[var(--border)]/60">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]">
                      {g.label}{" "}
                      <span className="font-normal">({g.cases.length})</span>
                    </summary>
                    <div className="overflow-x-auto px-1 pb-1">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                            <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("case_annotationMinutes")}</th>
                            <th className="py-1.5 font-medium">{tk("col_actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.cases.map((c) => (
                            <tr
                              key={c.id}
                              tabIndex={0}
                              className="cursor-pointer border-b border-[var(--border)]/50 hover:bg-[var(--bg)]/80"
                              onClick={() => setDetailId(c.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setDetailId(c.id);
                                }
                              }}
                            >
                              <td className="py-1.5 pr-2 font-mono font-medium text-[var(--text)]">
                                {c.caseId}
                              </td>
                              <td className="py-1.5 pr-2">{tk(`status_${c.status}` as DictKey)}</td>
                              <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                                {c.annotationMinutes ?? "—"}
                              </td>
                              <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 hover:border-[var(--accent)]"
                                    onClick={() => {
                                      setErr(null);
                                      setNoteCaseId(c.id);
                                      setNoteText("");
                                    }}
                                  >
                                    {tk("action_comment")}
                                  </button>
                                  {c.status === CaseStatus.SUBMITTED && (
                                    <>
                                      <button
                                        type="button"
                                        className="rounded border border-[var(--success)]/50 bg-[var(--success)]/15 px-1.5 py-0.5 text-[var(--success)] hover:bg-[var(--success)]/25"
                                        onClick={() => {
                                          setErr(null);
                                          setAudit({ caseId: c.id, decision: "ACCEPT" });
                                          setAuditComment("");
                                        }}
                                      >
                                        {tk("action_approve")}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded border border-[var(--danger)]/50 bg-[var(--danger)]/15 px-1.5 py-0.5 text-[var(--danger)] hover:bg-[var(--danger)]/25"
                                        onClick={() => {
                                          setErr(null);
                                          setAudit({ caseId: c.id, decision: "REJECT" });
                                          setAuditComment("");
                                        }}
                                      >
                                        {tk("action_reject")}
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--border)] px-1.5 py-0.5 hover:border-[var(--accent)]"
                                    onClick={() => setDetailId(c.id)}
                                  >
                                    {tk("action_details")}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {detailCase && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" role="presentation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default border-0 bg-transparent"
            aria-label={tk("drawer_close")}
            onClick={() => setDetailId(null)}
          />
          <div
            className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl"
            role="dialog"
            aria-modal
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-medium">{tk("action_details")}</span>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => setDetailId(null)}
              >
                {tk("drawer_close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ReviewerCaseDetailPanel lang={lang} c={detailCase} annotators={annotators} />
            </div>
          </div>
        </div>
      )}

      {noteCase && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setNoteCaseId(null);
            setErr(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-medium">{tk("action_comment")}</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">{noteCase.caseId}</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              placeholder={tk("review_comment")}
            />
            {err && <p className="mb-2 text-sm text-[var(--danger)]">{err}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => {
                  setNoteCaseId(null);
                  setErr(null);
                }}
              >
                {tk("drawer_close")}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={submitNote}
              >
                {tk("discussion_post")}
              </button>
            </div>
          </div>
        </div>
      )}

      {audit && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setAudit(null);
            setErr(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-medium">
              {audit.decision === "ACCEPT" ? tk("action_approve") : tk("action_reject")}
            </h3>
            <p className="mb-2 text-xs text-[var(--muted)]">
              {cases.find((x) => x.id === audit.caseId)?.caseId}
            </p>
            <textarea
              value={auditComment}
              onChange={(e) => setAuditComment(e.target.value)}
              rows={4}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              placeholder={
                audit.decision === "REJECT" ? tk("audit_reject_placeholder") : tk("review_comment")
              }
            />
            {err && <p className="mb-2 text-sm text-[var(--danger)]">{err}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => {
                  setAudit(null);
                  setErr(null);
                }}
              >
                {tk("drawer_close")}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={submitAudit}
              >
                {tk("save_review")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
