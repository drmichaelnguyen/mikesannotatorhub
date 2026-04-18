"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { addCaseNoteAction, assignCaseAction, submitAnnotationAction } from "@/app/actions/cases";
import {
  AnnotatorCaseDetailPanel,
  type AnnotatorCaseRow,
} from "@/components/annotator/AnnotatorCaseDetailPanel";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { getClipboardImageFile, readFileAsDataUrl } from "@/lib/client-image-data";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus } from "@prisma/client";

function groupByProject<T extends { redbrickProject: string; caseId: string }>(items: T[]) {
  const pm = new Map<string, T[]>();
  for (const c of items) {
    const proj = (c.redbrickProject || "").trim() || "—";
    if (!pm.has(proj)) pm.set(proj, []);
    pm.get(proj)!.push(c);
  }
  return [...pm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, list]) => ({
      project,
      cases: [...list].sort((a, b) => a.caseId.localeCompare(b.caseId)),
    }));
}

function AnnotatorAssignForm({ lang, caseDbId }: { lang: Lang; caseDbId: string }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async () => assignCaseAction(caseDbId),
    null as Awaited<ReturnType<typeof assignCaseAction>> | null,
  );
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <div className="flex flex-col items-start gap-1">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-[var(--accent)] bg-[var(--accent)]/15 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-50"
        >
          {tk("assign")}
        </button>
      </form>
      {state && !state.ok && (
        <span className="max-w-[12rem] text-[var(--danger)]">{tk("reviewer_assign_taken")}</span>
      )}
    </div>
  );
}

type SubmitResult = Awaited<ReturnType<typeof submitAnnotationAction>>;

function AnnotatorSubmitForm({
  lang,
  caseDbId,
  initialMinutes,
}: {
  lang: Lang;
  caseDbId: string;
  initialMinutes: number | null;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [minutes, setMinutes] = useState(String(initialMinutes ?? ""));
  const [state, action, pending] = useActionState(
    async (_: SubmitResult | null, fd: FormData) => {
      const m = Number(fd.get("minutes"));
      return submitAnnotationAction(caseDbId, m);
    },
    null as SubmitResult | null,
  );
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  useEffect(() => {
    setMinutes(String(initialMinutes ?? ""));
  }, [initialMinutes, caseDbId]);

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={action} className="flex flex-wrap items-end gap-1">
        <label className="flex items-center gap-1 text-[var(--muted)]">
          <span className="sr-only">{tk("minutes_spent")}</span>
          <input
            name="minutes"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-14 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 tabular-nums"
            aria-label={tk("minutes_spent")}
          />
        </label>
        <button
          type="submit"
          disabled={pending || !minutes}
          className="rounded border border-[var(--success)]/50 bg-[var(--success)]/15 px-2 py-0.5 text-[var(--success)] hover:bg-[var(--success)]/25 disabled:opacity-50"
        >
          {tk("submit")}
        </button>
      </form>
      {state && !state.ok && (
        <span className="text-[var(--danger)]">{tk("required")}</span>
      )}
    </div>
  );
}

export function AnnotatorWorkboard({
  lang,
  available,
  mine,
  rejected,
}: {
  lang: Lang;
  available: AnnotatorCaseRow[];
  mine: AnnotatorCaseRow[];
  rejected: AnnotatorCaseRow[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();

  const { inProgress, completed } = useMemo(() => {
    const activeStatuses = new Set<CaseStatus>([
      CaseStatus.ASSIGNED,
      CaseStatus.SUBMITTED,
      CaseStatus.REJECTED,
    ]);
    const doneStatuses = new Set<CaseStatus>([CaseStatus.ACCEPTED, CaseStatus.AUDITED]);
    const fromMine = mine.filter((c) => activeStatuses.has(c.status));
    const done = mine.filter((c) => doneStatuses.has(c.status));
    const progress = [...fromMine, ...rejected].sort((a, b) =>
      a.caseId.localeCompare(b.caseId),
    );
    return { inProgress: progress, completed: done };
  }, [mine, rejected]);

  const poolGroups = useMemo(() => groupByProject(available), [available]);
  const activeGroups = useMemo(() => groupByProject(inProgress), [inProgress]);
  const doneGroups = useMemo(() => groupByProject(completed), [completed]);

  const allRows = useMemo(
    () => [...available, ...inProgress, ...completed],
    [available, inProgress, completed],
  );

  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteCaseId, setNoteCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteRawImage, setNoteRawImage] = useState<string | null>(null);
  const [noteMarkedImage, setNoteMarkedImage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const detailRow = detailId ? (allRows.find((c) => c.id === detailId) ?? null) : null;
  const noteCase = noteCaseId ? (allRows.find((c) => c.id === noteCaseId) ?? null) : null;

  function refresh() {
    router.refresh();
  }

  function resetNoteComposer() {
    setNoteText("");
    setNoteRawImage(null);
    setNoteMarkedImage(null);
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

  function onNoteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void readFileAsDataUrl(f).then((dataUrl) => {
      if (!dataUrl) return;
      setNoteRawImage(dataUrl);
      setNoteMarkedImage(null);
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

  function canPostInDetail(row: AnnotatorCaseRow | null): boolean {
    if (!row) return false;
    if (row.status === CaseStatus.AVAILABLE) return false;
    return true;
  }

  function renderProjectTable(
    cases: AnnotatorCaseRow[],
    mode: "pool" | "active" | "done",
  ) {
    return (
      <div className="overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("col_redbrick")}</th>
              {mode !== "pool" && (
                <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
              )}
              {mode === "active" && (
                <th className="py-1.5 pr-2 font-medium">{tk("col_minutes")}</th>
              )}
              {mode === "done" && (
                <th className="py-1.5 pr-2 font-medium">{tk("case_compensation_earned")}</th>
              )}
              <th className="py-1.5 font-medium">{tk("col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
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
                  <div className="flex flex-wrap items-center gap-1">
                    <span>{c.caseId}</span>
                    <CopyTextButton lang={lang} value={c.caseId} />
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-[var(--muted)]">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="max-w-[200px] truncate" title={c.redbrickProject}>
                      {c.redbrickProject}
                    </span>
                    <CopyTextButton lang={lang} value={c.redbrickProject} />
                  </div>
                </td>
                {mode !== "pool" && (
                  <td className="py-1.5 pr-2">{tk(`status_${c.status}` as DictKey)}</td>
                )}
                {mode === "active" && (
                  <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                    {c.annotationMinutes ?? "—"}
                  </td>
                )}
                {mode === "done" && (
                  <td className="py-1.5 pr-2 tabular-nums text-[var(--success)]">
                    {formatCompensationAmount(
                      lang,
                      computeCompensation(
                        c.compensationType,
                        c.compensationAmount,
                        c.annotationMinutes,
                      ),
                    )}
                  </td>
                )}
                <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    {mode === "pool" && <AnnotatorAssignForm lang={lang} caseDbId={c.id} />}
                    {mode === "active" &&
                      (c.status === CaseStatus.ASSIGNED || c.status === CaseStatus.REJECTED) && (
                        <AnnotatorSubmitForm
                          lang={lang}
                          caseDbId={c.id}
                          initialMinutes={c.annotationMinutes}
                        />
                      )}
                    {mode === "active" && c.status === CaseStatus.SUBMITTED && (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                    {(mode === "active" || mode === "done") && (
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
    );
  }

  const emptyAll =
    available.length === 0 && inProgress.length === 0 && completed.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{tk("annotator_board_title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{tk("annotator_board_hint")}</p>
      </div>

      {emptyAll ? (
        <p className="text-[var(--muted)]">{tk("no_cases")}</p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">{tk("annotator_section_pool")}</h3>
            {available.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              <div className="space-y-2">
                {poolGroups.map((g) => (
                  <details
                    key={g.project}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{g.project}</span>
                        <CopyTextButton lang={lang} value={g.project === "—" ? "" : g.project} />
                        <span className="font-normal text-[var(--muted)]">({g.cases.length})</span>
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)]">{renderProjectTable(g.cases, "pool")}</div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">{tk("annotator_section_active")}</h3>
            {inProgress.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              <div className="space-y-2">
                {activeGroups.map((g) => (
                  <details
                    key={g.project}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{g.project}</span>
                        <CopyTextButton lang={lang} value={g.project === "—" ? "" : g.project} />
                        <span className="font-normal text-[var(--muted)]">({g.cases.length})</span>
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)]">{renderProjectTable(g.cases, "active")}</div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">{tk("annotator_section_done")}</h3>
            {completed.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              <div className="space-y-2">
                {doneGroups.map((g) => (
                  <details
                    key={g.project}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{g.project}</span>
                        <CopyTextButton lang={lang} value={g.project === "—" ? "" : g.project} />
                        <span className="font-normal text-[var(--muted)]">({g.cases.length})</span>
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)]">{renderProjectTable(g.cases, "done")}</div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {detailRow && (
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
              <AnnotatorCaseDetailPanel
                lang={lang}
                row={detailRow}
                canPostDiscussion={canPostInDetail(detailRow)}
              />
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
    </div>
  );
}
