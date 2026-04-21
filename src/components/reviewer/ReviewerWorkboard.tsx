"use client";

import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { addCaseNoteAction, reviewCaseAction, reviewerAssignCaseAction } from "@/app/actions/cases";
import { MentionTextarea } from "@/components/CaseDiscussion";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import { StarRating } from "@/components/StarRating";
import { ReviewerCaseDetailPanel } from "@/components/reviewer/ReviewerCaseDetailPanel";
import { getClipboardImageFile, getClipboardImageFiles, readFileAsDataUrl, readFilesAsDataUrls } from "@/lib/client-image-data";
import { computeCompensation } from "@/lib/compensation";
import { formatCompensationAmount, formatDate, formatMinutes } from "@/lib/format";
import { buildMentionOptionsForProject, type GuideOption, type TopicOption } from "@/lib/guide-topic";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { AnnotatorCapacityRow } from "@/app/actions/cases";
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

type AnnotatorProjectGroup = {
  project: string;
  statuses: { status: CaseStatus; cases: SerializedReviewerCase[] }[];
};

type AnnotatorFocus = {
  id: string;
  name: string;
  email: string;
  groups: AnnotatorProjectGroup[];
  total: number;
};

type AnnotatorPerformanceStats = {
  totalCases: number;
  completedCases: number;
  submittedCases: number;
  approvedCases: number;
  rejectedCases: number;
  averageDifficulty: number | null;
  difficultyCount: number;
  averageQuality: number | null;
  qualityCount: number;
  averageTime: number | null;
  timeCount: number;
};

type AnnotatorPerformanceProject = {
  project: string;
  stats: AnnotatorPerformanceStats;
  cases: SerializedReviewerCase[];
};

type AnnotatorPerformanceSummary = {
  id: string;
  name: string;
  email: string;
  stats: AnnotatorPerformanceStats;
  availabilityHours: number;
  assignedEstimateHours: number;
  remainingHours: number;
  assignedCaseCount: number;
  projects: AnnotatorPerformanceProject[];
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

function buildAnnotatorFocus(
  cases: SerializedReviewerCase[],
  annotatorId: string,
): AnnotatorFocus | null {
  const selected = cases.filter((c) => c.annotator?.id === annotatorId);
  if (selected.length === 0) return null;
  const annotator = selected[0].annotator!;
  const byProject = new Map<string, Map<CaseStatus, SerializedReviewerCase[]>>();
  for (const c of selected) {
    const project = (c.redbrickProject || "").trim() || "—";
    if (!byProject.has(project)) byProject.set(project, new Map());
    const byStatus = byProject.get(project)!;
    if (!byStatus.has(c.status)) byStatus.set(c.status, []);
    byStatus.get(c.status)!.push(c);
  }
  const statusOrder: CaseStatus[] = [
    CaseStatus.ASSIGNED,
    CaseStatus.SUBMITTED,
    CaseStatus.AUDITED,
    CaseStatus.ACCEPTED,
    CaseStatus.REJECTED,
    CaseStatus.AVAILABLE,
  ];
  const groups = [...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, statusMap]) => ({
      project,
      statuses: statusOrder
        .filter((status) => statusMap.has(status))
        .map((status) => ({
          status,
          cases: [...(statusMap.get(status) ?? [])].sort((a, b) => a.caseId.localeCompare(b.caseId)),
        })),
    }));
  return {
    id: annotator.id,
    name: annotator.name,
    email: annotator.email,
    groups,
    total: selected.length,
  };
}

function buildPerformanceStats(cases: SerializedReviewerCase[]): AnnotatorPerformanceStats {
  let completedCases = 0;
  let submittedCases = 0;
  let approvedCases = 0;
  let rejectedCases = 0;
  let difficultyTotal = 0;
  let difficultyCount = 0;
  let qualityTotal = 0;
  let qualityCount = 0;
  let timeTotal = 0;
  let timeCount = 0;

  for (const c of cases) {
    if (c.completedAt != null) completedCases += 1;
    if (c.status === CaseStatus.SUBMITTED) submittedCases += 1;
    if (c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED) approvedCases += 1;
    if (c.status === CaseStatus.REJECTED) rejectedCases += 1;
    if (c.difficultyRating != null) {
      difficultyTotal += c.difficultyRating;
      difficultyCount += 1;
    }
    if (c.qualityRating != null) {
      qualityTotal += c.qualityRating;
      qualityCount += 1;
    }
    if (c.annotationMinutes != null) {
      timeTotal += c.annotationMinutes;
      timeCount += 1;
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    totalCases: cases.length,
    completedCases,
    submittedCases,
    approvedCases,
    rejectedCases,
    averageDifficulty: difficultyCount > 0 ? round1(difficultyTotal / difficultyCount) : null,
    difficultyCount,
    averageQuality: qualityCount > 0 ? round1(qualityTotal / qualityCount) : null,
    qualityCount,
    averageTime: timeCount > 0 ? round1(timeTotal / timeCount) : null,
    timeCount,
  };
}

function buildAnnotatorPerformance(
  annotators: { id: string; name: string; email: string }[],
  cases: SerializedReviewerCase[],
  capacityRows: AnnotatorCapacityRow[],
): AnnotatorPerformanceSummary[] {
  const capacityById = new Map(capacityRows.map((row) => [row.id, row] as const));
  return annotators
    .map((annotator) => {
      const mine = cases.filter((c) => c.annotator?.id === annotator.id);
      const byProject = new Map<string, SerializedReviewerCase[]>();
      for (const c of mine) {
        const project = (c.redbrickProject || "").trim() || "—";
        if (!byProject.has(project)) byProject.set(project, []);
        byProject.get(project)!.push(c);
      }
      const projects = [...byProject.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([project, list]) => ({
          project,
          stats: buildPerformanceStats(list),
          cases: [...list].sort((a, b) => a.caseId.localeCompare(b.caseId)),
        }));
      const capacity = capacityById.get(annotator.id);
      return {
        ...annotator,
        stats: buildPerformanceStats(mine),
        availabilityHours: capacity?.availabilityHours ?? 0,
        assignedEstimateHours: capacity?.assignedEstimateHours ?? 0,
        remainingHours: capacity?.remainingHours ?? 0,
        assignedCaseCount: capacity?.assignedCaseCount ?? 0,
        projects,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ReviewerStatusCounts({ cases }: { cases: SerializedReviewerCase[] }) {
  const submitted = cases.filter((c) => c.status === CaseStatus.SUBMITTED).length;
  const rejected = cases.filter((c) => c.status === CaseStatus.REJECTED).length;
  const approved = cases.filter(
    (c) => c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED,
  ).length;
  const other = cases.length - submitted - rejected - approved;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-normal">
      {other > 0 && <span className="text-[var(--muted)]">{other}</span>}
      {submitted > 0 && <span className="font-semibold text-blue-400">{submitted}</span>}
      {approved > 0 && <span className="text-[var(--success)]">{approved}</span>}
      {rejected > 0 && <span className="text-[var(--danger)]">{rejected}</span>}
    </span>
  );
}

function statusLabel(lang: Lang, status: CaseStatus): string {
  return t(lang, `status_${status}` as DictKey);
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

function formatRating(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)} / 5`;
}

export function ReviewerWorkboard({
  lang,
  cases,
  annotators,
  capacityRows,
  guides,
  topics,
}: {
  lang: Lang;
  cases: SerializedReviewerCase[];
  annotators: { id: string; name: string; email: string }[];
  capacityRows: AnnotatorCapacityRow[];
  guides: GuideOption[];
  topics: TopicOption[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [audit, setAudit] = useState<{ caseId: string; decision: "ACCEPT" | "REJECT" } | null>(
    null,
  );
  const [auditComment, setAuditComment] = useState("");
  const [auditQualityRating, setAuditQualityRating] = useState<number | null>(null);
  const [auditRawImage, setAuditRawImage] = useState<string | null>(null);
  const [auditMarkedImage, setAuditMarkedImage] = useState<string | null>(null);
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignAnnotatorId, setAssignAnnotatorId] = useState("");
  const [annotatorFocusId, setAnnotatorFocusId] = useState<string | null>(null);
  const [selectedAnnotatorId, setSelectedAnnotatorId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const detailCase = detailId ? cases.find((c) => c.id === detailId) ?? null : null;
  const noteCase = noteCaseId ? cases.find((c) => c.id === noteCaseId) ?? null : null;
  const assignCase = assignCaseId ? cases.find((c) => c.id === assignCaseId) ?? null : null;
  const annotatorFocus = annotatorFocusId ? buildAnnotatorFocus(cases, annotatorFocusId) : null;
  const annotatorPerformance = useMemo(
    () => buildAnnotatorPerformance(annotators, cases, capacityRows),
    [annotators, cases, capacityRows],
  );
  const selectedAnnotator = selectedAnnotatorId
    ? annotatorPerformance.find((annotator) => annotator.id === selectedAnnotatorId) ?? null
    : null;
  const selectedCaseId = searchParams.get("case");
  const annotatorsQuery = searchParams.get("annotators");
  const detailMentionOptions = detailCase
    ? buildMentionOptionsForProject(guides, topics)
    : [];
  const noteMentionOptions = noteCase
    ? buildMentionOptionsForProject(guides, topics)
    : [];

  function syncCaseQuery(caseId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (caseId) params.set("case", caseId);
    else params.delete("case");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!selectedCaseId) {
      setDetailId(null);
      return;
    }
    if (cases.some((c) => c.id === selectedCaseId) && detailId !== selectedCaseId) {
      setDetailId(selectedCaseId);
    }
  }, [cases, detailId, selectedCaseId]);

  useEffect(() => {
    if (annotatorsQuery === "1") {
      setDetailId(null);
      return;
    }
    setSelectedAnnotatorId(null);
    setSelectedProject(null);
  }, [annotatorsQuery]);

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

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setAppliedSearch("");
  }

  function openAnnotatorFocus(annotatorId: string) {
    setErr(null);
    setAnnotatorFocusId(annotatorId);
  }

  function closeAnnotatorFocus() {
    setAnnotatorFocusId(null);
  }

  function closeAnnotatorPerformance() {
    setSelectedAnnotatorId(null);
    setSelectedProject(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("annotators");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function openAnnotatorPerformanceDetail(annotatorId: string) {
    setSelectedAnnotatorId(annotatorId);
    setSelectedProject(null);
  }

  function openAnnotatorProject(project: string) {
    setSelectedProject((prev) => (prev === project ? null : project));
  }

  function openCaseFromPerformance(caseId: string) {
    setSelectedAnnotatorId(null);
    setSelectedProject(null);
    setDetailId(caseId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("annotators");
    params.set("case", caseId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function resetNoteComposer() {
    setNoteText("");
    setNoteImages([]);
  }

  function resetAuditComposer() {
    setAuditComment("");
    setAuditQualityRating(null);
    setAuditRawImage(null);
    setAuditMarkedImage(null);
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
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    void readFilesAsDataUrls(files).then(addNoteImages);
    e.target.value = "";
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
    if (!auditQualityRating) {
      setErr(tk("rating_required"));
      return;
    }
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
        qualityRating: auditQualityRating,
      });
      if (!res.ok) {
        setErr(res.error === "rating" ? tk("rating_required") : tk("reviewer_assign_taken"));
        return;
      }
      setAudit(null);
      resetAuditComposer();
      closeDetail();
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
                <span>(</span>
                <ReviewerStatusCounts cases={p.groups.flatMap((g) => g.cases)} />
                <span>)</span>
              </summary>
              <div className="border-t border-[var(--border)] px-2 pb-2 pt-1">
                {p.groups.map((g) => (
                  <details key={g.key} className="mb-2 rounded-md border border-[var(--border)]/60">
              <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]">
                      {g.key === "__unassigned__" ? (
                        <span>{g.label}</span>
                      ) : (
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-left font-medium text-[var(--muted)] hover:text-[var(--accent)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAnnotatorFocus(g.key);
                          }}
                        >
                          {g.label}
                        </button>
                      )}{" "}
                      <span>(</span>
                      <ReviewerStatusCounts cases={g.cases} />
                      <span>)</span>
                    </summary>
                    <div className="overflow-x-auto px-1 pb-1">
                      <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                            <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
                            <th className="py-1.5 pr-2 font-medium">{tk("col_submittedAt")}</th>
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
                              className={`cursor-pointer border-b hover:bg-[var(--bg)]/80 ${
                                c.status === CaseStatus.SUBMITTED
                                  ? "border-blue-400/30 bg-blue-400/8"
                                  : "border-[var(--border)]/50"
                              }`}
                              onClick={() => openDetail(c.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openDetail(c.id);
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
                                {formatDate(lang, c.completedAt)}
                              </td>
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
                                      <CommentActionLabel
                                        label={tk("action_comment")}
                                        count={c.caseNotes.length}
                                      />
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
                                    onClick={() => openDetail(c.id)}
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
              <ReviewerCaseDetailPanel
                lang={lang}
                c={detailCase}
                annotators={annotators}
                guides={guides}
                mentionOptions={detailMentionOptions}
              />
            </div>
          </div>
        </div>
      )}

      {annotatorFocus && (
        <div className="fixed inset-0 z-[65] flex justify-end bg-black/50" role="presentation">
          <div
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label={tk("drawer_close")}
            onClick={closeAnnotatorFocus}
          />
          <div
            className="relative z-10 flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl lg:w-2/3"
            role="dialog"
            aria-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">{tk("reviewer_annotator_view_title")}</p>
                <p className="text-xs text-[var(--muted)]">
                  {annotatorFocus.name} ({annotatorFocus.email})
                </p>
              </div>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={closeAnnotatorFocus}
              >
                {tk("drawer_close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="mb-4 text-sm text-[var(--muted)]">
                {annotatorFocus.total} {tk("reviewer_annotator_view_count")}
              </p>
              {annotatorFocus.groups.map((group) => (
                <details
                  key={group.project}
                  className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]"
                >
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--surface)]">
                    {group.project}
                  </summary>
                  <div className="border-t border-[var(--border)] p-3">
                    {group.statuses.map((statusGroup) => (
                      <div key={statusGroup.status} className="mb-4 last:mb-0">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-[var(--text)]">
                            {statusLabel(lang, statusGroup.status)}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            {statusGroup.cases.length} {tk("reviewer_annotator_view_cases")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {statusGroup.cases.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-mono hover:border-[var(--accent)] hover:text-[var(--accent)]"
                              onClick={() => {
                                closeAnnotatorFocus();
                                openDetail(c.id);
                              }}
                            >
                              {c.caseId}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {annotatorsQuery === "1" && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" role="presentation">
          <div
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label={tk("drawer_close")}
            onClick={closeAnnotatorPerformance}
          />
          <div
            className="relative z-10 flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl lg:w-2/3"
            role="dialog"
            aria-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">{tk("reviewer_perf_title")}</p>
                <p className="text-xs text-[var(--muted)]">
                  {selectedAnnotator
                    ? `${selectedAnnotator.name} (${selectedAnnotator.email})`
                    : tk("reviewer_perf_hint")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedAnnotator && (
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() => {
                      setSelectedAnnotatorId(null);
                      setSelectedProject(null);
                    }}
                  >
                    {tk("reviewer_perf_overview")}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={closeAnnotatorPerformance}
                >
                  {tk("drawer_close")}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!selectedAnnotator ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--muted)]">{tk("reviewer_perf_hint")}</p>
                  {annotatorPerformance.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">{tk("reviewer_perf_no_cases")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                      <table className="w-full min-w-[1040px] text-left text-sm">
                        <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_annotator")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_projects")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_total")}</th>
                            <th className="px-3 py-2 font-medium">{tk("availability_total")}</th>
                            <th className="px-3 py-2 font-medium">{tk("availability_assigned")}</th>
                            <th className="px-3 py-2 font-medium">{tk("availability_remaining")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_avg_time")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_avg_difficulty")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_avg_quality")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {annotatorPerformance.map((annotator) => (
                            <tr
                              key={annotator.id}
                              className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)]/80"
                              onClick={() => openAnnotatorPerformanceDetail(annotator.id)}
                            >
                              <td className="px-3 py-2">
                                <div className="font-medium">{annotator.name}</div>
                                <div className="text-xs text-[var(--muted)]">{annotator.email}</div>
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {annotator.projects.length}
                              </td>
                              <td className="px-3 py-2 tabular-nums">{annotator.stats.totalCases}</td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {annotator.availabilityHours.toFixed(1)}h
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {annotator.assignedEstimateHours.toFixed(1)}h
                              </td>
                              <td
                                className={`px-3 py-2 tabular-nums font-medium ${
                                  annotator.remainingHours < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--success)]"
                                }`}
                              >
                                {annotator.remainingHours.toFixed(1)}h
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatMinutes(lang, annotator.stats.averageTime)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatRating(annotator.stats.averageDifficulty)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatRating(annotator.stats.averageQuality)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-medium">{selectedAnnotator.name}</p>
                        <p className="text-sm text-[var(--muted)]">{selectedAnnotator.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                          {selectedAnnotator.stats.totalCases} {tk("reviewer_perf_total")}
                        </span>
                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                          {formatMinutes(lang, selectedAnnotator.stats.averageTime)} {tk("reviewer_perf_avg_time")}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("availability_total")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.availabilityHours.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("availability_assigned")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.assignedEstimateHours.toFixed(1)}h</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {selectedAnnotator.assignedCaseCount} {tk("availability_cases")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("availability_remaining")}</p>
                        <p className={`mt-1 text-2xl font-semibold tabular-nums ${selectedAnnotator.remainingHours < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                          {selectedAnnotator.remainingHours.toFixed(1)}h
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_perf_completed")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.stats.completedCases}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_perf_submitted")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.stats.submittedCases}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_perf_approved")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.stats.approvedCases}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_perf_rejected")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{selectedAnnotator.stats.rejectedCases}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("reviewer_perf_avg_time")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMinutes(lang, selectedAnnotator.stats.averageTime)}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {selectedAnnotator.stats.timeCount} {tk("dash_rating_count")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_avg_difficulty")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatRating(selectedAnnotator.stats.averageDifficulty)}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {selectedAnnotator.stats.difficultyCount} {tk("dash_rating_count")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_avg_quality")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatRating(selectedAnnotator.stats.averageQuality)}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {selectedAnnotator.stats.qualityCount} {tk("dash_rating_count")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <section className="space-y-3">
                    {selectedAnnotator.projects.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">{tk("reviewer_perf_no_cases")}</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedAnnotator.projects.map((project) => {
                          const isOpen = selectedProject === project.project;
                          return (
                            <details
                              key={project.project}
                              open={isOpen}
                              className="rounded-xl border border-[var(--border)] bg-[var(--bg)]"
                            >
                              <summary
                                className="cursor-pointer select-none px-4 py-3 text-left hover:bg-[var(--surface)]"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openAnnotatorProject(project.project);
                                }}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium">{project.project}</p>
                                    <p className="text-xs text-[var(--muted)]">
                                      {project.stats.totalCases} {tk("reviewer_perf_total")}
                                    </p>
                                  </div>
                                  <div className="text-right text-xs text-[var(--muted)]">
                                    <p>
                                      {tk("reviewer_perf_avg_time")}: {formatMinutes(lang, project.stats.averageTime)}
                                    </p>
                                    <p>
                                      {tk("dash_avg_quality")}: {formatRating(project.stats.averageQuality)}
                                    </p>
                                  </div>
                                </div>
                              </summary>
                              <div className="border-t border-[var(--border)] p-3">
                                {project.cases.length === 0 ? (
                                  <p className="text-sm text-[var(--muted)]">{tk("reviewer_perf_no_project")}</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
                                      <thead>
                                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                                          <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("case_scope")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("col_submittedAt")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("case_difficultyRating")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("case_qualityRating")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("case_annotator")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
                                          <th className="py-1.5 pr-2 font-medium">{tk("col_compensation")}</th>
                                          <th className="py-1.5 font-medium">{tk("col_actions")}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {project.cases.map((c) => (
                                          <tr
                                            key={c.id}
                                            className={`border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/80 ${
                                              c.status === CaseStatus.SUBMITTED
                                                ? "bg-blue-400/5"
                                                : ""
                                            }`}
                                          >
                                            <td className="py-1.5 pr-2 font-mono font-medium text-[var(--text)]">
                                              <button
                                                type="button"
                                                className="rounded px-0.5 hover:text-[var(--accent)]"
                                                onClick={() => openCaseFromPerformance(c.id)}
                                              >
                                                {c.caseId}
                                              </button>
                                            </td>
                                            <td className="py-1.5 pr-2 text-[var(--muted)]">{c.scopeOfWork}</td>
                                            <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                                              {formatDate(lang, c.completedAt)}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                              {c.difficultyRating == null ? "—" : <StarRating label={tk("case_difficultyRating")} value={c.difficultyRating} />}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                              {c.qualityRating == null ? "—" : <StarRating label={tk("case_qualityRating")} value={c.qualityRating} />}
                                            </td>
                                            <td className="py-1.5 pr-2 text-[var(--muted)]">
                                              {c.annotator ? `${c.annotator.name}` : t(lang, "unassigned")}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                              {tk(`status_${c.status}` as DictKey)}
                                            </td>
                                            <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                                              {formatRowCompensation(lang, c)}
                                            </td>
                                            <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex flex-wrap gap-1">
                                                <button
                                                  type="button"
                                                  className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 hover:border-[var(--accent)]"
                                                  onClick={() => openCaseFromPerformance(c.id)}
                                                >
                                                  {tk("reviewer_perf_see_comments")}
                                                </button>
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
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
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
            <StarRating
              label={tk("reviewer_quality_rating")}
              value={auditQualityRating}
              onChange={setAuditQualityRating}
              required
            />
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
