"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { addCaseNoteAction, assignCaseAction, submitAnnotationAction } from "@/app/actions/cases";
import { MentionTextarea } from "@/components/CaseDiscussion";
import {
  AnnotatorCaseDetailPanel,
  type AnnotatorCaseRow,
} from "@/components/annotator/AnnotatorCaseDetailPanel";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { StarRating } from "@/components/StarRating";
import { getClipboardImageFiles, readFilesAsDataUrls } from "@/lib/client-image-data";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import { buildMentionOptionsForProject, type GuideOption, type TopicOption } from "@/lib/guide-topic";
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

function StatusCountBadges({ cases }: { cases: AnnotatorCaseRow[] }) {
  const rejected = cases.filter((c) => c.status === CaseStatus.REJECTED).length;
  const approved = cases.filter(
    (c) => c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED,
  ).length;
  const notSubmitted = cases.filter((c) => c.status === CaseStatus.ASSIGNED).length;
  const submitted = cases.filter((c) => c.status === CaseStatus.SUBMITTED).length;
  const available = cases.filter((c) => c.status === CaseStatus.AVAILABLE).length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-normal">
      {available > 0 && (
        <span className="text-[var(--muted)]">{available}</span>
      )}
      {notSubmitted > 0 && (
        <span className="text-[var(--text)]">{notSubmitted}</span>
      )}
      {submitted > 0 && (
        <span className="text-blue-400">{submitted}</span>
      )}
      {approved > 0 && (
        <span className="text-[var(--success)]">{approved}</span>
      )}
      {rejected > 0 && (
        <span className="text-[var(--danger)]">{rejected}</span>
      )}
    </span>
  );
}

function CommentActionLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-[var(--danger)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {count}
        </span>
      )}
    </span>
  );
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
  initialDifficultyRating,
}: {
  lang: Lang;
  caseDbId: string;
  initialMinutes: number | null;
  initialDifficultyRating: number | null;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [minutes, setMinutes] = useState(String(initialMinutes ?? ""));
  const [difficultyRating, setDifficultyRating] = useState<number | null>(initialDifficultyRating);
  const [state, action, pending] = useActionState(
    async (_: SubmitResult | null, fd: FormData) => {
      const m = Number(fd.get("minutes"));
      const r = Number(fd.get("difficultyRating"));
      return submitAnnotationAction(caseDbId, m, r);
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
        <input type="hidden" name="difficultyRating" value={difficultyRating ?? ""} />
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
      <StarRating
        label={tk("submit_difficulty")}
        value={difficultyRating}
        onChange={setDifficultyRating}
        required
      />
      {state && !state.ok && (
        <span className="text-[var(--danger)]">
          {state.error === "rating" ? tk("rating_required") : tk("required")}
        </span>
      )}
    </div>
  );
}

export function AnnotatorWorkboard({
  lang,
  available,
  mine,
  rejected,
  guides,
  topics,
}: {
  lang: Lang;
  available: AnnotatorCaseRow[];
  mine: AnnotatorCaseRow[];
  rejected: AnnotatorCaseRow[];
  guides: GuideOption[];
  topics: TopicOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const detailRow = detailId ? (allRows.find((c) => c.id === detailId) ?? null) : null;
  const noteCase = noteCaseId ? (allRows.find((c) => c.id === noteCaseId) ?? null) : null;
  const selectedCaseId = searchParams.get("case");
  const detailMentionOptions = detailRow
    ? buildMentionOptionsForProject(guides, topics)
    : [];
  const noteMentionOptions = noteCase
    ? buildMentionOptionsForProject(guides, topics)
    : [];

  useEffect(() => {
    if (!selectedCaseId) {
      setDetailId(null);
      return;
    }
    if (allRows.some((c) => c.id === selectedCaseId) && detailId !== selectedCaseId) {
      setDetailId(selectedCaseId);
    }
  }, [allRows, detailId, selectedCaseId]);

  function syncCaseQuery(caseId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (caseId) params.set("case", caseId);
    else params.delete("case");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function openDetail(caseId: string) {
    setDetailId(caseId);
    syncCaseQuery(caseId);
  }

  function closeDetail() {
    setDetailId(null);
    syncCaseQuery(null);
  }

  function refresh() {
    router.refresh();
  }

  function resetNoteComposer() {
    setNoteText("");
    setNoteImages([]);
  }

  function addNoteImages(dataUrls: string[]) {
    if (dataUrls.length === 0) return;
    setNoteImages((prev) => [...prev, ...dataUrls]);
  }

  function updateNoteImage(index: number, dataUrl: string | null) {
    if (!dataUrl) return;
    setNoteImages((prev) => prev.map((item, i) => (i === index ? dataUrl : item)));
  }

  function removeNoteImage(index: number) {
    setNoteImages((prev) => prev.filter((_, i) => i !== index));
  }

  const onPasteNote = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getClipboardImageFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    addNoteImages(await readFilesAsDataUrls(files));
  }, []);

  function onNoteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    void readFilesAsDataUrls(files).then(addNoteImages);
    e.target.value = "";
  }

  function submitNote() {
    if (!noteCaseId) return;
    const text = noteText.trim();
    if (!text && noteImages.length === 0) {
      setErr(tk("discussion_need_body"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await addCaseNoteAction({
        caseDbId: noteCaseId,
        content: text,
        imageDataList: noteImages,
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
            <tr
              className={`border-b ${
                mode === "pool"
                  ? "border-amber-300 text-amber-900"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
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
            {cases.map((c) => {
              const highlightReviewedComment = mode === "done" && (c.caseNotes?.length ?? 0) > 0;
              return (
              <tr
                key={c.id}
                tabIndex={0}
                className={`cursor-pointer border-b ${
                  mode === "pool"
                    ? "border-amber-200/80 bg-amber-50/90 hover:bg-amber-100/90"
                    : ""
                } ${
                  highlightReviewedComment
                    ? "border-[var(--danger)]/30 bg-[var(--danger)]/8"
                    : "border-[var(--border)]/50"
                } hover:bg-[var(--bg)]/80`}
                onClick={() => openDetail(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetail(c.id);
                  }
                }}
              >
                <td className={`py-1.5 pr-2 font-mono font-medium ${c.status === CaseStatus.REJECTED ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
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
                  <td className={`py-1.5 pr-2 ${c.status === CaseStatus.REJECTED ? "font-semibold text-[var(--danger)]" : ""}`}>
                    {tk(`status_${c.status}` as DictKey)}
                  </td>
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
                          initialDifficultyRating={c.difficultyRating}
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
                        <CommentActionLabel
                          label={tk("action_comment")}
                          count={c.caseNotes?.length ?? 0}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] px-1.5 py-0.5 hover:border-[var(--accent)]"
                      onClick={() => openDetail(c.id)}
                    >
                      {tk("action_details")}
                    </button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    );
  }

  const emptyAll =
    available.length === 0 && inProgress.length === 0 && completed.length === 0;
  const openPoolCount = available.length;

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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 shadow-sm shadow-amber-500/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">{tk("annotator_section_pool")}</h3>
                  <p className="mt-0.5 text-xs text-amber-950/80">
                    Available work waiting for assignment
                  </p>
                </div>
                <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
                  {openPoolCount} available
                </span>
              </div>
            </div>
            {available.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
            ) : (
              <div className="space-y-2">
                {poolGroups.map((g) => (
                  <details
                    key={g.project}
                    className="rounded-lg border border-amber-400/60 bg-amber-50/90 shadow-sm shadow-amber-500/5"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100/90">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{g.project}</span>
                        <CopyTextButton lang={lang} value={g.project === "—" ? "" : g.project} />
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          <StatusCountBadges cases={g.cases} />
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-amber-400/50">{renderProjectTable(g.cases, "pool")}</div>
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
                        <span>(</span><StatusCountBadges cases={g.cases} /><span>)</span>
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
                        <span>(</span><StatusCountBadges cases={g.cases} /><span>)</span>
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
          <div
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label={tk("drawer_close")}
            onClick={closeDetail}
          />
          <div
            className="relative z-10 flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl lg:w-2/3"
            role="dialog"
            aria-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-medium">{tk("action_details")}</span>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={closeDetail}
              >
                {tk("drawer_close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AnnotatorCaseDetailPanel
                lang={lang}
                row={detailRow}
                canPostDiscussion={canPostInDetail(detailRow)}
                mentionOptions={detailMentionOptions}
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
            <MentionTextarea
              lang={lang}
              value={noteText}
              onChange={setNoteText}
              onPaste={onPasteNote}
              rows={4}
              placeholder={tk("review_comment")}
              mentionOptions={noteMentionOptions}
            />
            <p className="mb-2 text-xs text-[var(--muted)]">{tk("discussion_hint")}</p>
            <div className="mb-2">
              <span className="text-sm text-[var(--muted)]">{tk("review_screenshot")}</span>
              <input type="file" accept="image/*" multiple onChange={onNoteFile} className="mt-1 block text-sm" />
            </div>
            {noteImages.length > 0 && (
              <div className="mb-2 space-y-3">
                {noteImages.map((image, index) => (
                  <div key={`${image.slice(0, 32)}-${index}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted)]">{tk("review_screenshot")} {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeNoteImage(index)}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                      >
                        {tk("remove_image")}
                      </button>
                    </div>
                    <div className="mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" className="max-h-40 rounded border border-[var(--border)] object-contain" />
                    </div>
                    <ScreenshotDrawer
                      lang={lang}
                      imageDataUrl={image}
                      onChange={(dataUrl) => updateNoteImage(index, dataUrl)}
                    />
                  </div>
                ))}
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
