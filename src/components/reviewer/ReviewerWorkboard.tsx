"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { addCaseNoteAction, reviewCaseAction, reviewerAssignCaseAction } from "@/app/actions/cases";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { ReviewerCaseDetailPanel } from "@/components/reviewer/ReviewerCaseDetailPanel";
import { getClipboardImageFile, readFileAsDataUrl } from "@/lib/client-image-data";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus, CompensationType } from "@prisma/client";

function formatRowCompensation(lang: Lang, c: SerializedReviewerCase): string {
  if (c.compensationType === CompensationType.PER_MINUTE && c.annotationMinutes == null) {
    return "—";
  }
  const v = computeCompensation(c.compensationType, c.compensationAmount, c.annotationMinutes);
  return formatCompensationAmount(lang, v);
}

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
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const filteredCases = useMemo(() => {
    const needle = appliedSearch.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter((c) => c.caseId.toLowerCase().includes(needle));
  }, [appliedSearch, cases]);
  const board = useMemo(() => buildBoard(filteredCases, lang), [filteredCases, lang]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteCaseId, setNoteCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteRawImage, setNoteRawImage] = useState<string | null>(null);
  const [noteMarkedImage, setNoteMarkedImage] = useState<string | null>(null);
  const [audit, setAudit] = useState<{ caseId: string; decision: "ACCEPT" | "REJECT" } | null>(
    null,
  );
  const [auditComment, setAuditComment] = useState("");
  const [auditRawImage, setAuditRawImage] = useState<string | null>(null);
  const [auditMarkedImage, setAuditMarkedImage] = useState<string | null>(null);
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignAnnotatorId, setAssignAnnotatorId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const detailCase = detailId ? cases.find((c) => c.id === detailId) ?? null : null;
  const noteCase = noteCaseId ? cases.find((c) => c.id === noteCaseId) ?? null : null;
  const assignCase = assignCaseId ? cases.find((c) => c.id === assignCaseId) ?? null : null;

  function refresh() {
    router.refresh();
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setAppliedSearch("");
  }

  function resetNoteComposer() {
    setNoteText("");
    setNoteRawImage(null);
    setNoteMarkedImage(null);
  }

  function resetAuditComposer() {
    setAuditComment("");
    setAuditRawImage(null);
    setAuditMarkedImage(null);
  }

  const onPasteNote = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getClipboardImageFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    setNoteRawImage(dataUrl);
    setNoteMarkedImage(null);
  }, []);

  const onPasteAudit = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getClipboardImageFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    setAuditRawImage(dataUrl);
    setAuditMarkedImage(null);
  }, []);

  function onNoteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void readFileAsDataUrl(f).then((dataUrl) => {
      if (!dataUrl) return;
      setNoteRawImage(dataUrl);
      setNoteMarkedImage(null);
    });
  }

  function onAuditFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void readFileAsDataUrl(f).then((dataUrl) => {
      if (!dataUrl) return;
      setAuditRawImage(dataUrl);
      setAuditMarkedImage(null);
    });
  }

  function submitNote() {
    if (!noteCaseId) return;
    const text = noteText.trim();
    const imageData = noteMarkedImage ?? noteRawImage;
    if (!text && !imageData) {
      setErr(tk("discussion_need_body"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId: noteCaseId,
        content: text,
        imageData,
      });
      if (!res.ok) {
        setErr(tk("required"));
        return;
      }
      setNoteCaseId(null);
      resetNoteComposer();
      refresh();
    });
  }

  function submitAssign() {
    if (!assignCaseId) return;
    setErr(null);
    start(async () => {
      const res = await reviewerAssignCaseAction(assignCaseId, assignAnnotatorId);
      if (!res.ok) {
        if (res.error === "invalid_annotator") setErr(tk("reviewer_assign_invalid"));
        else if (res.error === "required") setErr(tk("required"));
        else setErr(tk("reviewer_assign_taken"));
        return;
      }
      setAssignCaseId(null);
      setAssignAnnotatorId("");
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
        screenshotData: auditMarkedImage ?? auditRawImage,
      });
      if (!res.ok) {
        setErr(tk("reviewer_assign_taken"));
        return;
      }
      setAudit(null);
      resetAuditComposer();
      setDetailId(null);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{tk("reviewer_board_title")}</h2>
      <p className="text-sm text-[var(--muted)]">{tk("reviewer_board_hint")}</p>
      <form onSubmit={submitSearch} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-sm text-[var(--muted)]">{tk("reviewer_search_case_id")}</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tk("reviewer_search_case_id_placeholder")}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)]"
          >
            {tk("search")}
          </button>
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            {tk("clear_search")}
          </button>
        </div>
      </form>

      {filteredCases.length === 0 ? (
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
                      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                            <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("case_annotationMinutes")}</th>
                            <th
                              className="py-1.5 pr-2 font-medium"
                              title={tk("col_compensation_hint")}
                            >
                              {tk("col_compensation")}
                            </th>
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{c.caseId}</span>
                                  <CopyTextButton lang={lang} value={c.caseId} />
                                </div>
                              </td>
                              <td className="py-1.5 pr-2">{tk(`status_${c.status}` as DictKey)}</td>
                              <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                                {c.annotationMinutes ?? "—"}
                              </td>
                              <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                                {formatRowCompensation(lang, c)}
                              </td>
                              <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-wrap gap-1">
                                  {c.status === CaseStatus.AVAILABLE && (
                                    <button
                                      type="button"
                                      className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                                      onClick={() => {
                                        setErr(null);
                                        setAssignAnnotatorId("");
                                        setAssignCaseId(c.id);
                                      }}
                                    >
                                      {tk("action_assign")}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 hover:border-[var(--accent)]"
                                      onClick={() => {
                                        setErr(null);
                                        setNoteCaseId(c.id);
                                        resetNoteComposer();
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
                                          resetAuditComposer();
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
                                          resetAuditComposer();
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
            resetNoteComposer();
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
              onPaste={onPasteNote}
              rows={4}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              placeholder={tk("review_comment")}
            />
            <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
            <div className="mb-2">
              <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
              <input type="file" accept="image/*" onChange={onNoteFile} className="mt-1 block text-sm" />
            </div>
            {(noteRawImage || noteMarkedImage) && (
              <div className="mb-2">
                <ScreenshotDrawer
                  lang={lang}
                  imageDataUrl={noteMarkedImage ?? noteRawImage}
                  onChange={(dataUrl) => setNoteMarkedImage(dataUrl)}
                />
              </div>
            )}
            {err && <p className="mb-2 text-sm text-[var(--danger)]">{err}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => {
                  setNoteCaseId(null);
                  resetNoteComposer();
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

      {assignCase && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setAssignCaseId(null);
            setAssignAnnotatorId("");
            setErr(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-medium">{tk("reviewer_assign_heading")}</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">{assignCase.caseId}</p>
            {annotators.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)]">{tk("reviewer_assign_no_annotators")}</p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                    onClick={() => {
                      setAssignCaseId(null);
                      setErr(null);
                    }}
                  >
                    {tk("drawer_close")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-[var(--muted)]">{tk("reviewer_assign_help")}</p>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">{tk("reviewer_assign_select")}</span>
                  <select
                    value={assignAnnotatorId}
                    onChange={(e) => setAssignAnnotatorId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                  >
                    <option value="">{tk("reviewer_assign_placeholder")}</option>
                    {annotators.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                  </select>
                </label>
                {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                    onClick={() => {
                      setAssignCaseId(null);
                      setAssignAnnotatorId("");
                      setErr(null);
                    }}
                  >
                    {tk("drawer_close")}
                  </button>
                  <button
                    type="button"
                    disabled={pending || !assignAnnotatorId}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    onClick={submitAssign}
                  >
                    {tk("reviewer_assign_submit")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {audit && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            setAudit(null);
            resetAuditComposer();
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
              onPaste={onPasteAudit}
              rows={4}
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              placeholder={
                audit.decision === "REJECT" ? tk("audit_reject_placeholder") : tk("review_comment")
              }
            />
            <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
            <div className="mb-2">
              <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
              <input type="file" accept="image/*" onChange={onAuditFile} className="mt-1 block text-sm" />
            </div>
            {(auditRawImage || auditMarkedImage) && (
              <div className="mb-2">
                <ScreenshotDrawer
                  lang={lang}
                  imageDataUrl={auditMarkedImage ?? auditRawImage}
                  onChange={(dataUrl) => setAuditMarkedImage(dataUrl)}
                />
              </div>
            )}
            {err && <p className="mb-2 text-sm text-[var(--danger)]">{err}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => {
                  setAudit(null);
                  resetAuditComposer();
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
