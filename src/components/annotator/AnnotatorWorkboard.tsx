"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  assignCaseAction,
  submitAnnotationAction,
  unassignCaseAction,
  type PendingReviewAckCase,
} from "@/app/actions/cases";
import { MentionTextarea } from "@/components/CaseDiscussion";
import {
  AnnotatorCaseDetailPanel,
  type AnnotatorCaseRow,
} from "@/components/annotator/AnnotatorCaseDetailPanel";
import { AnnotatorReviewAckModal } from "@/components/annotator/AnnotatorReviewAckModal";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { createCaseNote, fetchCaseNotes } from "@/lib/case-note-api";
import { buildTemplateRowNote } from "@/lib/template-row-comment";
import { StarRating } from "@/components/StarRating";
import { getClipboardImageFiles, readFilesAsDataUrls } from "@/lib/client-image-data";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount } from "@/lib/format";
import { buildMentionOptionsForCase, type GuideOption, type TopicOption } from "@/lib/guide-topic";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus } from "@prisma/client";
import { useDebouncedSearchNeedle } from "@/lib/use-debounced-search-needle";

type CaseTree<T> = {
  project: string;
  scopes: {
    scope: string;
    rbProjects: { rbProject: string; cases: T[] }[];
  }[];
};

function getProjectName(_caseId: string): string {
  return "BC2";
}

function groupByHierarchy<T extends { redbrickProject: string; scopeOfWork: string; caseId: string }>(
  items: T[],
): CaseTree<T>[] {
  const projectMap = new Map<string, Map<string, Map<string, T[]>>>();
  for (const c of items) {
    const project = getProjectName(c.caseId);
    const scope = (c.scopeOfWork || "").trim() || "—";
    const rbProject = (c.redbrickProject || "").trim() || "—";
    if (!projectMap.has(project)) projectMap.set(project, new Map());
    const scopeMap = projectMap.get(project)!;
    if (!scopeMap.has(scope)) scopeMap.set(scope, new Map());
    const rbMap = scopeMap.get(scope)!;
    if (!rbMap.has(rbProject)) rbMap.set(rbProject, []);
    rbMap.get(rbProject)!.push(c);
  }
  return [...projectMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, scopeMap]) => ({
      project,
      scopes: [...scopeMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scope, rbMap]) => ({
          scope,
          rbProjects: [...rbMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([rbProject, list]) => ({
              rbProject,
              cases: [...list].sort((a, b) => a.caseId.localeCompare(b.caseId)),
            })),
        })),
    }));
}

type AnnotatorTreeSection = "ref" | "pool" | "active" | "doneAct" | "doneInact";

const AN_TREE_SEP = "\u001f";

function makeAnnotatorTreePath(parts: string[]): string {
  return parts.join(AN_TREE_SEP);
}

function collectAnnotatorExpandPathsForRow(section: AnnotatorTreeSection, row: AnnotatorCaseRow): Set<string> {
  const project = getProjectName(row.caseId);
  const scope = (row.scopeOfWork || "").trim() || "—";
  const rb = (row.redbrickProject || "").trim() || "—";
  const outerKey =
    section === "ref"
      ? "ref"
      : section === "pool"
        ? "pool"
        : section === "active"
          ? "active"
          : "done";
  const out = new Set<string>();
  out.add(makeAnnotatorTreePath(["annot", "outer", outerKey]));
  const chains: string[][] = [
    ["annot", section, project],
    ["annot", section, project, scope],
    ["annot", section, project, scope, rb],
  ];
  for (const parts of chains) out.add(makeAnnotatorTreePath(parts));
  return out;
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

function AnnotatorAssignForm({
  lang,
  caseDbId,
  takeDisabled = false,
}: {
  lang: Lang;
  caseDbId: string;
  takeDisabled?: boolean;
}) {
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
          disabled={pending || takeDisabled}
          className="rounded border border-[var(--accent)] bg-[var(--accent)]/15 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-50"
        >
          {tk("assign")}
        </button>
      </form>
      {state && !state.ok && (
        <span className="max-w-[14rem] text-[var(--danger)]">
          {state.error === "pending_review_ack"
            ? tk("annotator_review_ack_block_take")
            : tk("reviewer_assign_taken")}
        </span>
      )}
    </div>
  );
}

function AnnotatorUnassignForm({ lang, caseDbId }: { lang: Lang; caseDbId: string }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async () => unassignCaseAction(caseDbId),
    null as Awaited<ReturnType<typeof unassignCaseAction>> | null,
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
          className="rounded border border-[var(--danger)] bg-[var(--danger)]/10 px-2 py-0.5 text-[var(--danger)] hover:bg-[var(--danger)]/20 disabled:opacity-50"
        >
          {tk("untake")}
        </button>
      </form>
      {state && !state.ok && (
        <span className="max-w-[12rem] text-[var(--danger)]">{tk("reviewer_assign_taken")}</span>
      )}
    </div>
  );
}

type SubmitResult = Awaited<ReturnType<typeof submitAnnotationAction>>;
const TEMPLATE_ROW_MARKER_RE = /^\[\[TEMPLATE_ROW_(\d+)\]\]\s*(.*)$/;

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
        <div className="text-[var(--danger)]">
          <p>
            {state.error === "rating"
              ? tk("rating_required")
              : state.error === "template"
                ? tk("discussion_template_need_fill")
                : tk("required")}
          </p>
          {state.error === "template" &&
            "missingTemplateFields" in state &&
            Array.isArray(state.missingTemplateFields) &&
            state.missingTemplateFields.length > 0 && (
              <p className="mt-1 text-xs">
                {tk("discussion_template_missing_prefix")} {state.missingTemplateFields.join(", ")}
              </p>
            )}
        </div>
      )}
    </div>
  );
}

export function AnnotatorWorkboard({
  lang,
  available,
  mine,
  rejected,
  reference,
  guides,
  topics,
  pendingReviewAcks = [],
}: {
  lang: Lang;
  available: AnnotatorCaseRow[];
  mine: AnnotatorCaseRow[];
  rejected: AnnotatorCaseRow[];
  reference: AnnotatorCaseRow[];
  guides: GuideOption[];
  topics: TopicOption[];
  pendingReviewAcks?: PendingReviewAckCase[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const searchNeedle = useDebouncedSearchNeedle(searchInput, 300);
  const annotatorBoardRef = useRef<HTMLDivElement | null>(null);

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

  const matchesSearchNeedle = useCallback(
    (c: AnnotatorCaseRow) => {
      const n = searchNeedle.toLowerCase();
      if (!n) return true;
      return (
        c.id.toLowerCase().includes(n) ||
        c.caseId.toLowerCase().includes(n) ||
        (c.redbrickProject || "").trim().toLowerCase().includes(n) ||
        (c.scopeOfWork || "").trim().toLowerCase().includes(n)
      );
    },
    [searchNeedle],
  );

  const filteredAvailable = useMemo(
    () => (searchNeedle ? available.filter(matchesSearchNeedle) : available),
    [available, searchNeedle, matchesSearchNeedle],
  );
  const filteredInProgress = useMemo(
    () => (searchNeedle ? inProgress.filter(matchesSearchNeedle) : inProgress),
    [inProgress, searchNeedle, matchesSearchNeedle],
  );
  const filteredCompleted = useMemo(
    () => (searchNeedle ? completed.filter(matchesSearchNeedle) : completed),
    [completed, searchNeedle, matchesSearchNeedle],
  );
  const filteredReference = useMemo(
    () => (searchNeedle ? reference.filter(matchesSearchNeedle) : reference),
    [reference, searchNeedle, matchesSearchNeedle],
  );

  const poolGroups = useMemo(() => groupByHierarchy(filteredAvailable), [filteredAvailable]);
  const activeGroups = useMemo(() => groupByHierarchy(filteredInProgress), [filteredInProgress]);
  const referenceGroups = useMemo(() => groupByHierarchy(filteredReference), [filteredReference]);
  const allRows = useMemo(
    () => [...available, ...inProgress, ...completed, ...reference],
    [available, inProgress, completed, reference],
  );
  const projectActivity = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of allRows) {
      const project = (row.redbrickProject || "").trim() || "—";
      const current = map.get(project) ?? false;
      map.set(
        project,
        current ||
          (row.status !== CaseStatus.AUDITED && row.status !== CaseStatus.ACCEPTED),
      );
    }
    return map;
  }, [allRows]);
  const doneActiveCases = useMemo(
    () =>
      completed.filter((c) => projectActivity.get((c.redbrickProject || "").trim() || "—")),
    [completed, projectActivity],
  );
  const doneInactiveCases = useMemo(
    () =>
      completed.filter((c) => !projectActivity.get((c.redbrickProject || "").trim() || "—")),
    [completed, projectActivity],
  );
  const filteredDoneActiveCases = useMemo(
    () => (searchNeedle ? doneActiveCases.filter(matchesSearchNeedle) : doneActiveCases),
    [doneActiveCases, searchNeedle, matchesSearchNeedle],
  );
  const filteredDoneInactiveCases = useMemo(
    () => (searchNeedle ? doneInactiveCases.filter(matchesSearchNeedle) : doneInactiveCases),
    [doneInactiveCases, searchNeedle, matchesSearchNeedle],
  );
  const doneActiveGroups = useMemo(
    () => groupByHierarchy(filteredDoneActiveCases),
    [filteredDoneActiveCases],
  );
  const doneInactiveGroups = useMemo(
    () => groupByHierarchy(filteredDoneInactiveCases),
    [filteredDoneInactiveCases],
  );

  const annotatorSearchHitIds = useMemo(() => {
    if (!searchNeedle) return null;
    const ids = new Set<string>();
    for (const c of filteredReference) ids.add(c.id);
    for (const c of filteredAvailable) ids.add(c.id);
    for (const c of filteredInProgress) ids.add(c.id);
    for (const c of filteredDoneActiveCases) ids.add(c.id);
    for (const c of filteredDoneInactiveCases) ids.add(c.id);
    return ids;
  }, [
    searchNeedle,
    filteredReference,
    filteredAvailable,
    filteredInProgress,
    filteredDoneActiveCases,
    filteredDoneInactiveCases,
  ]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteCaseId, setNoteCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteTemplateOptions, setNoteTemplateOptions] = useState<Array<{ index: number; label: string }>>([]);
  const [noteTemplateSelectedIndex, setNoteTemplateSelectedIndex] = useState<number | null>(null);
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const annotatorExpandPaths = useMemo(() => {
    if (!searchNeedle) return new Set<string>();
    const out = new Set<string>();
    const add = (rows: AnnotatorCaseRow[], section: AnnotatorTreeSection) => {
      for (const c of rows) {
        for (const p of collectAnnotatorExpandPathsForRow(section, c)) out.add(p);
      }
    };
    add(filteredReference, "ref");
    add(filteredAvailable, "pool");
    add(filteredInProgress, "active");
    add(filteredDoneActiveCases, "doneAct");
    if (showInactiveProjects) add(filteredDoneInactiveCases, "doneInact");
    return out;
  }, [
    searchNeedle,
    filteredReference,
    filteredAvailable,
    filteredInProgress,
    filteredDoneActiveCases,
    filteredDoneInactiveCases,
    showInactiveProjects,
  ]);

  useLayoutEffect(() => {
    const root = annotatorBoardRef.current;
    if (!root || annotatorExpandPaths.size === 0) return;
    for (const el of root.querySelectorAll("details[data-tree-path]")) {
      const p = el.getAttribute("data-tree-path");
      if (p && annotatorExpandPaths.has(p)) (el as HTMLDetailsElement).open = true;
    }
    const hit = root.querySelector<HTMLElement>("[data-case-search-hit='1']");
    hit?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [annotatorExpandPaths, searchNeedle, poolGroups, activeGroups, referenceGroups, doneActiveGroups, doneInactiveGroups]);

  const detailRow = detailId ? (allRows.find((c) => c.id === detailId) ?? null) : null;
  const noteCase = noteCaseId ? (allRows.find((c) => c.id === noteCaseId) ?? null) : null;
  const selectedCaseId = searchParams.get("case");
  const detailMentionOptions = detailRow
    ? buildMentionOptionsForCase(guides, topics, {
        redbrickProject: detailRow.redbrickProject,
        scopeOfWork: detailRow.scopeOfWork,
      })
    : [];
  const noteMentionOptions = noteCase
    ? buildMentionOptionsForCase(guides, topics, {
        redbrickProject: noteCase.redbrickProject,
        scopeOfWork: noteCase.scopeOfWork,
      })
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
    setNoteTemplateOptions([]);
    setNoteTemplateSelectedIndex(null);
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
    const baseText = noteText.trim();
    let text = baseText;
    if (noteTemplateSelectedIndex != null && noteCase) {
      const templateRows = (noteCase.scopeOfWorkTemplate ?? "")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      const rowLabel = templateRows[noteTemplateSelectedIndex];
      if (rowLabel) {
        text = buildTemplateRowNote(noteTemplateSelectedIndex, rowLabel, baseText);
      }
    }
    if (!text && noteImages.length === 0) {
      setErr(tk("discussion_need_body"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await createCaseNote({
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

  useEffect(() => {
    if (!noteCaseId || !noteCase) {
      setNoteTemplateOptions([]);
      setNoteTemplateSelectedIndex(null);
      return;
    }
    const templateRows = (noteCase.scopeOfWorkTemplate ?? "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);
    if (templateRows.length === 0) {
      setNoteTemplateOptions([]);
      setNoteTemplateSelectedIndex(null);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await fetchCaseNotes(noteCaseId);
      if (!alive) return;
      const completed = new Set<number>();
      if (res.ok) {
        for (const note of res.notes) {
          const content = (note.content ?? "").trim();
          const match = content.match(TEMPLATE_ROW_MARKER_RE);
          if (!match) continue;
          const idx = Number(match[1]) - 1;
          if (Number.isInteger(idx) && idx >= 0 && idx < templateRows.length) completed.add(idx);
        }
      }
      const options = templateRows
        .map((label, index) => ({ index, label }))
        .filter((item) => !completed.has(item.index));
      setNoteTemplateOptions(options);
      setNoteTemplateSelectedIndex(null);
    })();
    return () => {
      alive = false;
    };
  }, [noteCase, noteCaseId]);

  function canPostInDetail(row: AnnotatorCaseRow | null): boolean {
    if (!row) return false;
    if (row.isReference) return true;
    if (row.status === CaseStatus.AVAILABLE) return false;
    return true;
  }

  function renderProjectTable(
    cases: AnnotatorCaseRow[],
    mode: "pool" | "active" | "done" | "reference",
    searchHitIds: Set<string> | null,
  ) {
    const isPool = mode === "pool";
    return (
      <div className="overflow-x-auto px-1 pb-1">
        <table
          className={`w-full min-w-[560px] border-collapse text-left text-xs ${
            isPool ? "text-slate-900" : "text-[var(--text)]"
          }`}
        >
          <thead>
            <tr
              className={`border-b ${
                isPool
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
              const highlightReviewedComment =
                (mode === "done" || mode === "reference") && (c._count?.caseNotes ?? 0) > 0;
              return (
              <tr
                key={c.id}
                tabIndex={0}
                data-case-search-hit={searchHitIds?.has(c.id) ? "1" : undefined}
                className={`cursor-pointer border-b ${
                  isPool
                      ? "border-amber-200/80 bg-amber-50/90 hover:bg-amber-100/90"
                      : highlightReviewedComment
                        ? "border-[var(--danger)]/30 bg-[var(--danger)]/8 hover:bg-[var(--bg)]/80"
                        : "border-[var(--border)]/50 hover:bg-[var(--bg)]/80"
                }`}
                onClick={() => openDetail(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetail(c.id);
                  }
                }}
              >
                <td
                  className={`py-1.5 pr-2 font-mono font-medium ${
                    c.status === CaseStatus.REJECTED
                      ? "text-[var(--danger)]"
                      : isPool
                        ? "text-slate-900"
                        : "text-[var(--text)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {c.isReference && (
                      <span
                        title={tk("case_reference")}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-yellow-500 bg-yellow-300 px-1 text-[11px] font-bold leading-none text-yellow-950 shadow-sm"
                      >
                        ★
                      </span>
                    )}
                    <span>{c.caseId}</span>
                    <CopyTextButton lang={lang} value={c.caseId} />
                  </div>
                </td>
                <td className={`py-1.5 pr-2 ${isPool ? "text-slate-700" : "text-[var(--muted)]"}`}>
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
                        c.maxMinutesPerCase,
                        c.annotatorBonus,
                      ),
                    )}
                  </td>
                )}
                <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    {mode === "pool" && (
                      <AnnotatorAssignForm
                        lang={lang}
                        caseDbId={c.id}
                        takeDisabled={pendingReviewAcks.length > 0}
                      />
                    )}
                    {mode === "active" &&
                      (c.status === CaseStatus.ASSIGNED || c.status === CaseStatus.REJECTED) && (
                        <AnnotatorSubmitForm
                          lang={lang}
                          caseDbId={c.id}
                          initialMinutes={c.annotationMinutes}
                          initialDifficultyRating={c.difficultyRating}
                        />
                      )}
                    {mode === "active" && c.status === CaseStatus.ASSIGNED && (
                      <AnnotatorUnassignForm lang={lang} caseDbId={c.id} />
                    )}
                    {mode === "active" && c.status === CaseStatus.SUBMITTED && (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                    {(mode === "active" || mode === "done" || mode === "reference") && (
                      <button
                        type="button"
                        className={`rounded border px-1.5 py-0.5 hover:border-[var(--accent)] ${
                          isPool
                            ? "border-slate-300 bg-white text-slate-900"
                            : "border-[var(--border)] bg-[var(--bg)]"
                        }`}
                        onClick={() => {
                          setErr(null);
                          setNoteCaseId(c.id);
                          resetNoteComposer();
                        }}
                      >
                        <CommentActionLabel
                          label={tk("action_comment")}
                          count={c._count?.caseNotes ?? 0}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`rounded border px-1.5 py-0.5 hover:border-[var(--accent)] ${
                        isPool
                          ? "border-slate-300 bg-white text-slate-900"
                          : "border-[var(--border)]"
                      }`}
                      onClick={() => openDetail(c.id)}
                    >
                      {tk("action_details")}
                    </button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderHierarchy(
    groups: CaseTree<AnnotatorCaseRow>[],
    mode: "pool" | "active" | "done" | "reference",
    className: string,
    treeSectionId: AnnotatorTreeSection,
  ) {
    const isPool = mode === "pool";
    return (
      <div className="space-y-2">
        {groups.map((projectGroup) => {
          const projectPath = makeAnnotatorTreePath(["annot", treeSectionId, projectGroup.project]);
          return (
          <details key={projectPath} data-tree-path={projectPath} className={className}>
            <summary
              className={`cursor-pointer select-none px-3 py-2 text-sm font-medium ${
                isPool ? "text-amber-950 hover:bg-amber-100/80" : "text-[var(--text)] hover:bg-[var(--bg)]"
              }`}
            >
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>{projectGroup.project}</span>
                <span>(</span>
                <StatusCountBadges
                  cases={projectGroup.scopes.flatMap((scope) =>
                    scope.rbProjects.flatMap((rbGroup) => rbGroup.cases),
                  )}
                />
                <span>)</span>
              </span>
            </summary>
            <div
              className={`space-y-2 border-t px-2 pb-2 pt-2 ${
                isPool ? "border-amber-300/70" : "border-[var(--border)]"
              }`}
            >
              {projectGroup.scopes.map((scopeGroup) => {
                const scopePath = makeAnnotatorTreePath([
                  "annot",
                  treeSectionId,
                  projectGroup.project,
                  scopeGroup.scope,
                ]);
                return (
                <details key={scopePath} data-tree-path={scopePath} className="rounded-md border border-[var(--border)]/60 bg-[var(--surface)]">
                  <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-[var(--text)] hover:text-[var(--accent)]">
                    <span>{scopeGroup.scope}</span>
                    <span className="ml-1">(</span>
                    <StatusCountBadges
                      cases={scopeGroup.rbProjects.flatMap((rbGroup) => rbGroup.cases)}
                    />
                    <span>)</span>
                  </summary>
                  <div className="space-y-2 border-t border-[var(--border)]/60 px-2 pb-2 pt-2">
                    {scopeGroup.rbProjects.map((rbGroup) => {
                      const rbPath = makeAnnotatorTreePath([
                        "annot",
                        treeSectionId,
                        projectGroup.project,
                        scopeGroup.scope,
                        rbGroup.rbProject,
                      ]);
                      return (
                      <details key={rbPath} data-tree-path={rbPath} className="rounded-md border border-[var(--border)]/60 bg-[var(--surface)]">
                        <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-[var(--text)] hover:text-[var(--accent)]">
                          <span>{rbGroup.rbProject}</span>
                          <span className="ml-1">(</span>
                          <StatusCountBadges cases={rbGroup.cases} />
                          <span>)</span>
                        </summary>
                        <div className="border-t border-[var(--border)]/60">
                          {renderProjectTable(rbGroup.cases, mode, annotatorSearchHitIds)}
                        </div>
                      </details>
                    );
                    })}
                  </div>
                </details>
                );
              })}
            </div>
          </details>
          );
        })}
      </div>
    );
  }

  const emptyAll =
    available.length === 0 &&
    inProgress.length === 0 &&
    completed.length === 0 &&
    reference.length === 0;
  const openPoolCount = filteredAvailable.length;
  const undoneCount = filteredInProgress.length;

  function clearCaseSearch() {
    setSearchInput("");
  }

  return (
    <div className="space-y-6">
      {pendingReviewAcks.length > 0 && (
        <AnnotatorReviewAckModal lang={lang} pending={pendingReviewAcks} />
      )}
      <div>
        <h2 className="text-lg font-medium">{tk("annotator_board_title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{tk("annotator_board_hint")}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-sm text-[var(--muted)]">{tk("reviewer_search_case_id")}</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={tk("reviewer_search_case_id_placeholder")}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={clearCaseSearch}
          className="self-start rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)] sm:self-end"
        >
          {tk("clear_search")}
        </button>
      </div>

      {emptyAll ? (
        <p className="text-[var(--muted)]">{tk("no_cases")}</p>
      ) : (
        <div ref={annotatorBoardRef} className="space-y-2">
          <section className="space-y-2">
            <details
              data-tree-path={makeAnnotatorTreePath(["annot", "outer", "ref"])}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg)]">
                <span>{tk("annotator_section_reference")}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">({filteredReference.length})</span>
              </summary>
              <div className="border-t border-[var(--border)] p-3">
                {reference.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : filteredReference.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : (
                  renderHierarchy(
                    referenceGroups,
                    "reference",
                    "rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/5",
                    "ref",
                  )
                )}
              </div>
            </details>
          </section>

          <section className="space-y-2">
            <details
              data-tree-path={makeAnnotatorTreePath(["annot", "outer", "pool"])}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 shadow-sm shadow-amber-500/10"
            >
              <summary className="cursor-pointer list-none select-none px-3 py-3 hover:bg-amber-200/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800">
                      {tk("annotator_section_pool")}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-amber-800/90">
                      Available work waiting for assignment
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
                    {openPoolCount} available
                  </span>
                </div>
              </summary>
              <div className="border-t border-amber-500/30 p-3">
                {available.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : filteredAvailable.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : (
                  renderHierarchy(
                    poolGroups,
                    "pool",
                    "rounded-lg border border-amber-500/40 bg-amber-100/40 shadow-sm shadow-amber-500/5",
                    "pool",
                  )
                )}
              </div>
            </details>
          </section>

          <section className="space-y-2">
            <details
              data-tree-path={makeAnnotatorTreePath(["annot", "outer", "active"])}
              className="rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/8 shadow-sm shadow-[var(--accent)]/10"
            >
              <summary className="cursor-pointer list-none select-none px-3 py-3 hover:bg-[var(--accent)]/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    {tk("annotator_section_active")}
                  </h3>
                  <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white">
                    {undoneCount} undone
                  </span>
                </div>
              </summary>
              <div className="border-t border-[var(--accent)]/25 p-3">
                {inProgress.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : filteredInProgress.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : (
                  renderHierarchy(
                    activeGroups,
                    "active",
                    "rounded-lg border border-[var(--border)] bg-[var(--surface)]",
                    "active",
                  )
                )}
              </div>
            </details>
          </section>

          <section className="space-y-2">
            <details
              data-tree-path={makeAnnotatorTreePath(["annot", "outer", "done"])}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg)]">
                <span>{tk("annotator_section_done")}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">({filteredCompleted.length})</span>
              </summary>
              <div className="border-t border-[var(--border)] p-3">
                {completed.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : filteredCompleted.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {tk("annotator_projects_active")}
                        </h4>
                        <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={showInactiveProjects}
                            onChange={(e) => setShowInactiveProjects(e.target.checked)}
                            className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg)]"
                          />
                          <span>{tk("annotator_show_inactive_projects")}</span>
                        </label>
                      </div>
                      {doneActiveGroups.length === 0 ? (
                        <p className="text-sm text-[var(--muted)]">{tk("no_cases")}</p>
                      ) : (
                        renderHierarchy(
                          doneActiveGroups,
                          "done",
                          "rounded-lg border border-[var(--border)] bg-[var(--surface)]",
                          "doneAct",
                        )
                      )}
                    </div>

                    {showInactiveProjects && doneInactiveGroups.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {tk("annotator_projects_inactive")}
                        </h4>
                        {renderHierarchy(
                          doneInactiveGroups,
                          "done",
                          "rounded-lg border border-[var(--border)] bg-[var(--surface)] opacity-90",
                          "doneInact",
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
          </section>
        </div>
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
                guides={guides}
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
            {noteTemplateOptions.length > 0 && (
              <label className="mb-2 block">
                <span className="text-sm text-[var(--muted)]">{tk("discussion_template_field")}</span>
                <select
                  value={noteTemplateSelectedIndex == null ? "" : String(noteTemplateSelectedIndex)}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) {
                      setNoteTemplateSelectedIndex(null);
                      return;
                    }
                    const idx = Number(next);
                    if (!Number.isInteger(idx)) {
                      setNoteTemplateSelectedIndex(null);
                      return;
                    }
                    setNoteTemplateSelectedIndex(idx);
                    setNoteText("");
                  }}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                >
                  <option value="">{tk("discussion_template_general_comment")}</option>
                  {noteTemplateOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
