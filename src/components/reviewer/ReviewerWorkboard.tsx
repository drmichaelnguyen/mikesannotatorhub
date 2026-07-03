"use client";

import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import {
  batchUpdateCasesAction,
  deleteCaseAction,
  reviewCaseAction,
  reviewerAssignCaseAction,
} from "@/app/actions/cases";
import { MentionTextarea } from "@/components/CaseDiscussion";
import { CaseDetailLink } from "@/components/CaseDetailLink";
import {
  readAnnotatorsPanelFromBrowser,
  replaceCaseQueryInBrowser,
  replaceSearchInBrowser,
} from "@/lib/case-detail-url";
import {
  useCaseDetailSync,
  useCaseDetailUrlState,
  useDeferredCaseDetailClose,
} from "@/lib/use-case-detail-sync";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ScreenshotDrawer } from "@/components/ScreenshotDrawer";
import {
  AnnotatorCaseDetailPanel,
  type AnnotatorCaseRow,
  type ReferenceCaseLinkRow,
} from "@/components/annotator/AnnotatorCaseDetailPanel";
import { createCaseNote } from "@/lib/case-note-api";
import { StarRating } from "@/components/StarRating";
import { ReviewerCaseDetailPanel } from "@/components/reviewer/ReviewerCaseDetailPanel";
import { getClipboardImageFile, getClipboardImageFiles, readFileAsDataUrl, readFilesAsDataUrls } from "@/lib/client-image-data";
import {
  computeCaseBasePay,
  computeCompensation,
  computeTimeCompensation,
  caseWasResubmitted,
  suggestedQualityAdjustment,
} from "@/lib/compensation";
import { CaseCompensationAmountButton } from "@/components/CaseCompensationBreakdown";
import { formatCompensationAmount, formatDate, formatHours, formatMinutes } from "@/lib/format";
import { buildMentionOptionsForCase, type GuideOptionLite, type TopicOptionLite } from "@/lib/guide-topic";
import { parseVideoGuideUrlsInput } from "@/lib/video-guides";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
import type { AnnotatorCapacityRow } from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { CaseStatus, CompensationType } from "@prisma/client";
import { useDebouncedSearchNeedle } from "@/lib/use-debounced-search-needle";

const TREE_PATH_SEP = "\u001f";

function normalizeScopeKey(scope: string): string {
  return scope.trim().toLowerCase().replace(/\s+/g, " ");
}

function makeTreePath(parts: string[]): string {
  return parts.join(TREE_PATH_SEP);
}

function collectReviewerExpandPaths(
  nodes: GroupNode[],
  matchIds: Set<string>,
  ancestors: string[] = [],
): Set<string> {
  const open = new Set<string>();
  for (const node of nodes) {
    const parts = [...ancestors, node.key];
    const selfPath = makeTreePath(parts);
    if (node.children.length > 0) {
      const childOpen = collectReviewerExpandPaths(node.children, matchIds, parts);
      for (const p of childOpen) open.add(p);
      if (childOpen.size > 0) open.add(selfPath);
    } else if (node.cases.some((c) => matchIds.has(c.id))) {
      for (let i = 1; i <= parts.length; i++) {
        open.add(makeTreePath(parts.slice(0, i)));
      }
    }
  }
  return open;
}

function CaseRowCompensation({ lang, c }: { lang: Lang; c: SerializedReviewerCase }) {
  if (c.compensationType === CompensationType.PER_MINUTE && c.annotationMinutes == null) {
    return "—";
  }
  const amount = computeCompensation(
    c.compensationType,
    c.compensationAmount,
    c.annotationMinutes,
    c.maxMinutesPerCase,
    c.minMinutesPerCase,
    c.annotatorBonus,
  );
  return (
    <CaseCompensationAmountButton
      lang={lang}
      amount={amount}
      inputs={{
        compensationType: c.compensationType,
        compensationAmount: c.compensationAmount,
        annotationMinutes: c.annotationMinutes,
        minMinutesPerCase: c.minMinutesPerCase,
        maxMinutesPerCase: c.maxMinutesPerCase,
        annotatorBonus: c.annotatorBonus,
        wasResubmitted: c.wasResubmitted || caseWasResubmitted(c.reviews),
      }}
      title={c.caseId}
    />
  );
}

function readReviewerStatusFilter(params: Pick<URLSearchParams, "get">): CaseStatus | null {
  return params.get("status") === CaseStatus.SUBMITTED ? CaseStatus.SUBMITTED : null;
}

function sameValue<T>(rows: SerializedReviewerCase[], getValue: (row: SerializedReviewerCase) => T): T | null {
  if (rows.length === 0) return null;
  const first = getValue(rows[0]);
  return rows.every((row) => Object.is(getValue(row), first)) ? first : null;
}

function sameTopicIds(rows: SerializedReviewerCase[]): string[] {
  if (rows.length === 0) return [];
  const first = rows[0].topics.map((topic) => topic.id).sort();
  const firstKey = first.join("\n");
  return rows.every((row) => row.topics.map((topic) => topic.id).sort().join("\n") === firstKey)
    ? first
    : [];
}

type GroupDimension = "project" | "scope" | "rbProject" | "annotator";

type GroupNode = {
  key: string;
  label: string;
  cases: SerializedReviewerCase[];
  children: GroupNode[];
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

type CompensationHistoryCaseRow = {
  caseDbId: string;
  caseId: string;
  project: string;
  submittedAt: string | null;
  compensationType: CompensationType;
  compensationAmount: number;
  annotationMinutes: number | null;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  wasResubmitted: boolean;
  baseCompensation: number;
  bonusCompensation: number;
  totalCompensation: number;
};

type CompensationHistoryRow = {
  monthKey: string;
  label: string;
  baseCompensation: number;
  bonusCompensation: number;
  totalCompensation: number;
  auditedCount: number;
  totalMinutes: number;
  averagePayPerHour: number | null;
  cases: CompensationHistoryCaseRow[];
};

type AnnotatorCompensationPeriods = {
  baseAllTime: number;
  bonusAllTime: number;
  auditedCount: number;
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  history: CompensationHistoryRow[];
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
  compensation: AnnotatorCompensationPeriods;
  capacityWindows: AnnotatorCapacityRow["windows"];
  projects: AnnotatorPerformanceProject[];
};

function getProjectName(c: Pick<SerializedReviewerCase, "caseId">): string {
  void c;
  return "BC2";
}

function getGroupInfo(c: SerializedReviewerCase, dimension: GroupDimension): { key: string; label: string } {
  if (dimension === "project") {
    const label = getProjectName(c);
    return { key: `project:${label}`, label };
  }
  if (dimension === "scope") {
    const label = (c.scopeOfWork || "").trim() || "—";
    return { key: `scope:${label}`, label };
  }
  if (dimension === "rbProject") {
    const label = (c.redbrickProject || "").trim() || "—";
    return { key: `rbProject:${label}`, label };
  }
  const annotatorId = c.annotator?.id ?? "unassigned";
  const annotatorName = c.annotator?.name?.trim() || "Unassigned";
  return { key: `annotator:${annotatorId}`, label: annotatorName };
}

function buildGroupedTree(
  cases: SerializedReviewerCase[],
  order: GroupDimension[],
  depth = 0,
): GroupNode[] {
  if (depth >= order.length) return [];
  const dimension = order[depth];
  const grouped = new Map<string, { label: string; cases: SerializedReviewerCase[] }>();
  for (const c of cases) {
    const info = getGroupInfo(c, dimension);
    if (!grouped.has(info.key)) grouped.set(info.key, { label: info.label, cases: [] });
    grouped.get(info.key)!.cases.push(c);
  }
  return [...grouped.entries()]
    .sort(([, a], [, b]) => a.label.localeCompare(b.label))
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      cases: [...entry.cases].sort((a, b) => a.caseId.localeCompare(b.caseId)),
      children: buildGroupedTree(entry.cases, order, depth + 1),
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Calendar month key in UTC so Node SSR and browser hydration agree (local TZ differs). */
function compensationMonthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(lang: Lang, monthKey: string) {
  const [y, m] = monthKey.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function buildCompensationPeriods(
  lang: Lang,
  cases: SerializedReviewerCase[],
): AnnotatorCompensationPeriods {
  const now = new Date();
  const thisMonthKey = compensationMonthKeyUtc(now);
  const lastMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthKey = compensationMonthKeyUtc(lastMonthAnchor);

  let thisMonth = 0;
  let lastMonth = 0;
  let allTime = 0;
  let baseAllTime = 0;
  let bonusAllTime = 0;
  let auditedCount = 0;
  const monthly = new Map<
    string,
    {
      baseCompensation: number;
      bonusCompensation: number;
      totalCompensation: number;
      auditedCount: number;
      totalMinutes: number;
      cases: CompensationHistoryCaseRow[];
    }
  >();

  for (const c of cases) {
    if (c.status !== CaseStatus.AUDITED && c.status !== CaseStatus.ACCEPTED) continue;
    const baseAmount = computeTimeCompensation(
      c.compensationType,
      c.compensationAmount,
      c.annotationMinutes,
      c.maxMinutesPerCase,
      c.minMinutesPerCase,
    );
    const bonusAmount = c.annotatorBonus;
    const amount = Math.max(0, Math.round((baseAmount + bonusAmount) * 100) / 100);
    const minutes = c.annotationMinutes ?? 0;
    allTime += amount;
    baseAllTime += baseAmount;
    bonusAllTime += bonusAmount;
    auditedCount += 1;

    const acceptedAtRaw = c.reviews[0]?.createdAt ?? c.auditedAt ?? c.completedAt;
    const acceptedAt = acceptedAtRaw ? new Date(acceptedAtRaw) : null;
    if (!acceptedAt || Number.isNaN(acceptedAt.getTime())) continue;
    const monthKey = compensationMonthKeyUtc(acceptedAt);
    if (monthKey === thisMonthKey) thisMonth += amount;
    if (monthKey === lastMonthKey) lastMonth += amount;

    const prev = monthly.get(monthKey) ?? {
      baseCompensation: 0,
      bonusCompensation: 0,
      totalCompensation: 0,
      auditedCount: 0,
      totalMinutes: 0,
      cases: [],
    };
    prev.baseCompensation += baseAmount;
    prev.bonusCompensation += bonusAmount;
    prev.totalCompensation += amount;
    prev.auditedCount += 1;
    prev.totalMinutes += minutes;
    prev.cases.push({
      caseDbId: c.id,
      caseId: c.caseId,
      project: c.redbrickProject.trim() || "—",
      submittedAt: c.completedAt,
      compensationType: c.compensationType,
      compensationAmount: c.compensationAmount,
      annotationMinutes: c.annotationMinutes,
      minMinutesPerCase: c.minMinutesPerCase,
      maxMinutesPerCase: c.maxMinutesPerCase,
      wasResubmitted: c.wasResubmitted,
      baseCompensation: round2(baseAmount),
      bonusCompensation: round2(bonusAmount),
      totalCompensation: round2(amount),
    });
    monthly.set(monthKey, prev);
  }

  const history = [...monthly.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, value]) => {
      const totalMinutes = round2(value.totalMinutes);
      const totalCompensation = round2(value.totalCompensation);
      return {
        monthKey,
        label: formatMonthLabel(lang, monthKey),
        baseCompensation: round2(value.baseCompensation),
        bonusCompensation: round2(value.bonusCompensation),
        totalCompensation,
        auditedCount: value.auditedCount,
        totalMinutes,
        averagePayPerHour:
          totalMinutes > 0 ? round2((totalCompensation * 60) / totalMinutes) : null,
        cases: [...value.cases].sort((a, b) => a.caseId.localeCompare(b.caseId)),
      };
    });

  return {
    baseAllTime: round2(baseAllTime),
    bonusAllTime: round2(bonusAllTime),
    auditedCount,
    thisMonth: round2(thisMonth),
    lastMonth: round2(lastMonth),
    allTime: round2(allTime),
    history,
  };
}

function buildAnnotatorPerformance(
  lang: Lang,
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
        compensation: buildCompensationPeriods(lang, mine),
        capacityWindows: capacity?.windows ?? [],
        projects,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getCapacityWindow(
  annotator: AnnotatorPerformanceSummary,
  key: "24h" | "72h" | "7d",
) {
  return annotator.capacityWindows.find((window) => window.key === key) ?? {
    key,
    days: key === "24h" ? 1 : key === "72h" ? 3 : 7,
    availableHours: 0,
    assignedEstimateHours: 0,
    remainingHours: 0,
  };
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
  scopeTemplates,
}: {
  lang: Lang;
  cases: SerializedReviewerCase[];
  annotators: { id: string; name: string; email: string }[];
  capacityRows: AnnotatorCapacityRow[];
  guides: GuideOptionLite[];
  topics: TopicOptionLite[];
  scopeTemplates: { scopeOfWork: string; template: string }[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const searchNeedle = useDebouncedSearchNeedle(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | null>(() =>
    readReviewerStatusFilter(searchParams),
  );
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);
  const [showGroupingControls, setShowGroupingControls] = useState(false);
  const [groupOrder, setGroupOrder] = useState<GroupDimension[]>([
    "project",
    "scope",
    "rbProject",
    "annotator",
  ]);
  const searchedCases = useMemo(() => {
    const needle = searchNeedle.toLowerCase();
    if (!needle) return cases;
    return cases.filter(
      (c) =>
        c.id.toLowerCase().includes(needle) ||
        c.caseId.toLowerCase().includes(needle) ||
        (c.redbrickProject || "").trim().toLowerCase().includes(needle) ||
        c.scopeOfWork.toLowerCase().includes(needle),
    );
  }, [searchNeedle, cases]);
  const filteredCases = useMemo(() => {
    if (!statusFilter) return searchedCases;
    return searchedCases.filter((c) => c.status === statusFilter);
  }, [searchedCases, statusFilter]);
  const projectActivity = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of cases) {
      const project = (row.redbrickProject || "").trim() || "—";
      const current = map.get(project) ?? false;
      map.set(
        project,
        current ||
          (row.status !== CaseStatus.AUDITED && row.status !== CaseStatus.ACCEPTED),
      );
    }
    return map;
  }, [cases]);
  const visibleCases = useMemo(
    () =>
      showInactiveProjects
        ? filteredCases
        : filteredCases.filter((row) => projectActivity.get((row.redbrickProject || "").trim() || "—")),
    [filteredCases, projectActivity, showInactiveProjects],
  );
  const groupedBoard = useMemo(() => buildGroupedTree(visibleCases, groupOrder), [visibleCases, groupOrder]);
  const reviewerSearchHitIds = useMemo(() => {
    if (!searchNeedle) return null;
    return new Set(visibleCases.map((c) => c.id));
  }, [searchNeedle, visibleCases]);
  const reviewerTreeExpandPaths = useMemo(() => {
    if (!searchNeedle || !reviewerSearchHitIds || reviewerSearchHitIds.size === 0) {
      return new Set<string>();
    }
    return collectReviewerExpandPaths(groupedBoard, reviewerSearchHitIds);
  }, [searchNeedle, groupedBoard, reviewerSearchHitIds]);
  const groupedTreeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = groupedTreeRef.current;
    if (!root || reviewerTreeExpandPaths.size === 0) return;
    for (const el of root.querySelectorAll("details[data-tree-path]")) {
      const p = el.getAttribute("data-tree-path");
      if (p && reviewerTreeExpandPaths.has(p)) (el as HTMLDetailsElement).open = true;
    }
    const hit = root.querySelector<HTMLElement>("[data-case-search-hit='1']");
    hit?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [reviewerTreeExpandPaths, groupedBoard, searchNeedle]);

  const scopeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cases
            .map((c) => c.scopeOfWork.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [cases],
  );

  const [detailId, setDetailId] = useState<string | null>(null);
  const {
    isClosing: detailClosing,
    scheduleUnmount: scheduleDetailUnmount,
    cancelScheduledUnmount: cancelDetailUnmount,
  } = useDeferredCaseDetailClose();
  const [detailMode, setDetailMode] = useState<"reviewer" | "annotator">("reviewer");
  const [noteCaseId, setNoteCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [audit, setAudit] = useState<{ caseId: string; decision: "ACCEPT" | "REJECT" } | null>(
    null,
  );
  const [auditComment, setAuditComment] = useState("");
  const [auditQualityRating, setAuditQualityRating] = useState<number | null>(null);
  const [auditAnnotatorBonus, setAuditAnnotatorBonus] = useState("");
  const [auditRawImage, setAuditRawImage] = useState<string | null>(null);
  const [auditMarkedImage, setAuditMarkedImage] = useState<string | null>(null);
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignAnnotatorId, setAssignAnnotatorId] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchGuideId, setBatchGuideId] = useState("");
  const [batchTopicIds, setBatchTopicIds] = useState<string[]>([]);
  const [batchGuideline, setBatchGuideline] = useState("");
  const [batchVideoGuideUrls, setBatchVideoGuideUrls] = useState("");
  const [batchRedbrickProject, setBatchRedbrickProject] = useState("");
  const [batchScopeOfWork, setBatchScopeOfWork] = useState("");
  const [batchMinMinutes, setBatchMinMinutes] = useState("");
  const [batchMaxMinutes, setBatchMaxMinutes] = useState("");
  const [batchCompType, setBatchCompType] = useState<CompensationType>(CompensationType.PER_CASE);
  const [batchCompAmount, setBatchCompAmount] = useState("");
  const [batchBonusAmount, setBatchBonusAmount] = useState("");
  const [annotatorFocusId, setAnnotatorFocusId] = useState<string | null>(null);
  const [annotatorsPanelOpen, setAnnotatorsPanelOpen] = useState(
    () => searchParams.get("annotators") === "1",
  );
  const [selectedAnnotatorId, setSelectedAnnotatorId] = useState<string | null>(null);
  const [expandedCompMonthKey, setExpandedCompMonthKey] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const templateByScope = useMemo(
    () =>
      new Map(
        scopeTemplates.map((item) => [item.scopeOfWork.trim(), item.template] as const),
      ),
    [scopeTemplates],
  );

  const detailCase = detailId ? cases.find((c) => c.id === detailId) ?? null : null;
  const detailAnnotatorRow = useMemo<AnnotatorCaseRow | null>(() => {
    if (!detailCase) return null;
    return {
      ...detailCase,
      _count: {
        caseNotes: detailCase.caseNoteCount,
        reviews: detailCase.wasResubmitted ? 1 : 0,
      },
      scopeOfWorkTemplate: templateByScope.get(detailCase.scopeOfWork.trim()) ?? null,
    } as unknown as AnnotatorCaseRow;
  }, [detailCase, templateByScope]);
  const detailReferenceCases = useMemo<ReferenceCaseLinkRow[]>(() => {
    if (!detailCase) return [];
    const scope = normalizeScopeKey(detailCase.scopeOfWork);
    if (!scope) return [];
    return cases
      .filter((row) => row.isReference && row.id !== detailCase.id && normalizeScopeKey(row.scopeOfWork) === scope)
      .sort((a, b) => a.caseId.localeCompare(b.caseId))
      .map((row) => ({
        id: row.id,
        caseId: row.caseId,
        redbrickProject: row.redbrickProject,
        scopeOfWork: row.scopeOfWork,
      }));
  }, [detailCase, cases]);
  const noteCase = noteCaseId ? cases.find((c) => c.id === noteCaseId) ?? null : null;
  const assignCase = assignCaseId ? cases.find((c) => c.id === assignCaseId) ?? null : null;
  const annotatorFocus = useMemo(
    () => (annotatorFocusId ? buildAnnotatorFocus(cases, annotatorFocusId) : null),
    [annotatorFocusId, cases],
  );
  const annotatorPerformance = useMemo(
    () => buildAnnotatorPerformance(lang, annotators, cases, capacityRows),
    [lang, annotators, cases, capacityRows],
  );
  const selectedAnnotator = selectedAnnotatorId
    ? annotatorPerformance.find((annotator) => annotator.id === selectedAnnotatorId) ?? null
    : null;
  const detailMentionOptions = useMemo(
    () =>
      detailCase
        ? buildMentionOptionsForCase(guides, topics, {
            redbrickProject: detailCase.redbrickProject,
            scopeOfWork: detailCase.scopeOfWork,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailCase?.id, guides, topics],
  );
  const noteMentionOptions = useMemo(
    () =>
      noteCase
        ? buildMentionOptionsForCase(guides, topics, {
            redbrickProject: noteCase.redbrickProject,
            scopeOfWork: noteCase.scopeOfWork,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteCase?.id, guides, topics],
  );

  function syncCaseQuery(caseId: string | null, amendSearch?: (params: URLSearchParams) => void) {
    replaceCaseQueryInBrowser(pathname, searchParams.toString(), caseId, amendSearch);
  }

  const isValidCase = useCallback((id: string) => cases.some((c) => c.id === id), [cases]);

  function openDetail(caseId: string, amendSearch?: (params: URLSearchParams) => void) {
    cancelDetailUnmount();
    setDetailMode("reviewer");
    setDetailId(caseId);
    syncCaseQuery(caseId, amendSearch);
  }

  function openAnnotatorDetail(caseId: string) {
    cancelDetailUnmount();
    setDetailMode("annotator");
    setDetailId(caseId);
    syncCaseQuery(caseId);
  }

  function closeDetail() {
    if (!detailId) return;
    syncCaseQuery(null);
    scheduleDetailUnmount(() => setDetailId(null));
  }

  useCaseDetailSync(isValidCase, openDetail, closeDetail);
  useCaseDetailUrlState(setDetailId, isValidCase);

  useEffect(() => {
    setAnnotatorsPanelOpen(readAnnotatorsPanelFromBrowser());
    setStatusFilter(readReviewerStatusFilter(searchParams));
  }, [searchParams]);

  useEffect(() => {
    function onPopState() {
      setAnnotatorsPanelOpen(readAnnotatorsPanelFromBrowser());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (annotatorsPanelOpen) {
      closeDetail();
      return;
    }
    setSelectedAnnotatorId(null);
    setSelectedProject(null);
  }, [annotatorsPanelOpen]);

  function refresh() {
    router.refresh();
  }

  function removeAvailableCase(caseDbId: string) {
    if (!window.confirm(tk("reviewer_delete_case_confirm"))) return;
    setErr(null);
    start(async () => {
      const res = await deleteCaseAction(caseDbId);
      if (!res.ok) {
        setErr(res.error === "state" ? tk("reviewer_delete_case_taken") : tk("required"));
        return;
      }
      if (detailId === caseDbId) closeDetail();
      refresh();
    });
  }

  function clearSearch() {
    setSearchInput("");
    clearStatusFilter();
  }

  function clearStatusFilter() {
    setStatusFilter(null);
    replaceSearchInBrowser(pathname, searchParams.toString(), (params) => {
      params.delete("status");
    });
  }

  function toggleCaseSelection(caseId: string, checked: boolean) {
    setSelectedCaseIds((prev) => {
      if (checked) return prev.includes(caseId) ? prev : [...prev, caseId];
      return prev.filter((id) => id !== caseId);
    });
  }

  function clearSelection() {
    setSelectedCaseIds([]);
  }

  function openBatchEditForRows(rows: SerializedReviewerCase[]) {
    if (rows.length === 0) return;
    setSelectedCaseIds(rows.map((row) => row.id));
    setBatchRedbrickProject(sameValue(rows, (row) => row.redbrickProject) ?? "");
    setBatchGuideId(sameValue(rows, (row) => row.guide?.id ?? "") ?? "");
    setBatchTopicIds(sameTopicIds(rows));
    setBatchGuideline(sameValue(rows, (row) => row.guideline) ?? "");
    setBatchVideoGuideUrls(sameValue(rows, (row) => row.videoGuideUrls.join("\n")) ?? "");
    setBatchScopeOfWork(sameValue(rows, (row) => row.scopeOfWork) ?? "");
    setBatchMinMinutes(String(sameValue(rows, (row) => row.minMinutesPerCase) ?? ""));
    setBatchMaxMinutes(String(sameValue(rows, (row) => row.maxMinutesPerCase) ?? ""));
    setBatchCompType(sameValue(rows, (row) => row.compensationType) ?? CompensationType.PER_CASE);
    setBatchCompAmount(String(sameValue(rows, (row) => row.compensationAmount) ?? ""));
    setBatchBonusAmount(String(sameValue(rows, (row) => row.annotatorBonus) ?? ""));
    setErr(null);
    setBatchEditOpen(true);
  }

  function openBatchEdit() {
    if (selectedCaseIds.length === 0) return;
    const selectedRows = cases.filter((row) => selectedCaseIds.includes(row.id));
    openBatchEditForRows(selectedRows);
  }

  function submitBatchEdit() {
    const minMinutesPerCase = Number(batchMinMinutes);
    const maxMinutesPerCase = Number(batchMaxMinutes);
    const compensationAmount = Number(batchCompAmount);
    const annotatorBonus = Number(batchBonusAmount);
    if (
      !Number.isFinite(minMinutesPerCase) ||
      !Number.isFinite(maxMinutesPerCase) ||
      !Number.isFinite(compensationAmount) ||
      !Number.isFinite(annotatorBonus)
    ) {
      setErr(tk("required"));
      return;
    }
    setErr(null);
    start(async () => {
      const res = await batchUpdateCasesAction({
        caseDbIds: selectedCaseIds,
        redbrickProject: batchRedbrickProject,
        guideId: batchGuideId,
        topicIds: batchTopicIds,
        guideline: batchGuideline,
        videoGuideUrls: parseVideoGuideUrlsInput(batchVideoGuideUrls),
        scopeOfWork: batchScopeOfWork,
        minMinutesPerCase,
        maxMinutesPerCase,
        compensationType: batchCompType,
        compensationAmount,
        annotatorBonus,
      });
      if (!res.ok) {
        if (res.error === "limits") setErr(tk("case_limits_invalid"));
        else if (res.error === "scope_words") setErr(tk("scope_word_limit"));
        else setErr(tk("required"));
        return;
      }
      setBatchEditOpen(false);
      clearSelection();
      refresh();
    });
  }

  function openAnnotatorFocus(annotatorId: string) {
    setErr(null);
    setAnnotatorFocusId(annotatorId);
  }

  function closeAnnotatorFocus() {
    setAnnotatorFocusId(null);
  }

  function closeAnnotatorPerformance() {
    setAnnotatorsPanelOpen(false);
    setSelectedAnnotatorId(null);
    setExpandedCompMonthKey(null);
    setSelectedProject(null);
    replaceSearchInBrowser(pathname, searchParams.toString(), (params) => {
      params.delete("annotators");
    });
  }

  function openAnnotatorPerformanceDetail(annotatorId: string) {
    setSelectedAnnotatorId(annotatorId);
    setExpandedCompMonthKey(null);
    setSelectedProject(null);
  }

  function openAnnotatorProject(project: string) {
    setSelectedProject((prev) => (prev === project ? null : project));
  }

  function openCaseFromPerformance(caseId: string) {
    setSelectedAnnotatorId(null);
    setSelectedProject(null);
    openDetail(caseId, (params) => {
      params.delete("annotators");
    });
  }

  function resetNoteComposer() {
    setNoteText("");
    setNoteImages([]);
  }

  function resetAuditComposer() {
    setAuditComment("");
    setAuditQualityRating(null);
    setAuditAnnotatorBonus("");
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

  function submitAssign() {
    if (!assignCaseId) return;
    setErr(null);
    start(async () => {
      const res = await reviewerAssignCaseAction(assignCaseId, assignAnnotatorId);
      if (!res.ok) {
        if (res.error === "invalid_annotator") setErr(tk("reviewer_assign_invalid"));
        else if (res.error === "required") setErr(tk("required"));
        else if (res.error === "pending_review_ack") setErr(tk("annotator_review_ack_block_assign"));
        else if (res.error === "active_case") setErr(tk("annotator_active_case_block_assign"));
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
    const auditCase = cases.find((c) => c.id === audit.caseId);
    const bonus =
      audit.decision === "ACCEPT"
        ? auditAnnotatorBonus.trim()
          ? Number(auditAnnotatorBonus)
          : auditCase
            ? suggestedQualityAdjustment(
                auditQualityRating,
                computeCaseBasePay(
                  auditCase.compensationType,
                  auditCase.compensationAmount,
                  auditCase.minMinutesPerCase,
                  auditCase.maxMinutesPerCase,
                ),
                {
                  wasResubmitted:
                    auditCase.wasResubmitted || caseWasResubmitted(auditCase.reviews),
                },
              )
            : 0
        : undefined;
    if (bonus != null && !Number.isFinite(bonus)) {
      setErr(tk("required"));
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
        annotatorBonus: bonus,
      });
      if (!res.ok) {
        setErr(
          res.error === "rating"
            ? tk("rating_required")
            : res.error === "bonus"
              ? tk("required")
              : tk("reviewer_assign_taken"),
        );
        return;
      }
      setAudit(null);
      resetAuditComposer();
      closeDetail();
      refresh();
    });
  }

  function groupDimensionLabel(dimension: GroupDimension): string {
    if (dimension === "project") return "Project";
    if (dimension === "scope") return tk("case_scope");
    if (dimension === "rbProject") return tk("col_redbrick");
    return tk("case_annotator");
  }

  function setGroupDimension(level: number, next: GroupDimension) {
    setGroupOrder((prev) => {
      const updated = [...prev];
      const existingIdx = updated.indexOf(next);
      if (existingIdx >= 0) {
        const swap = updated[level];
        updated[level] = next;
        updated[existingIdx] = swap;
        return updated;
      }
      updated[level] = next;
      return updated;
    });
  }

  function renderCaseTable(rows: SerializedReviewerCase[], searchHitIds: Set<string> | null) {
    return (
      <div className="overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text)]">
              <th className="py-1.5 pr-2 font-medium">{tk("reviewer_batch_select")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("col_case_id")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("case_scope")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("case_annotator")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("case_status")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("col_submittedAt")}</th>
              <th className="py-1.5 pr-2 font-medium">{tk("case_annotationMinutes")}</th>
              <th className="py-1.5 pr-2 font-medium" title={tk("col_compensation_hint")}>
                {tk("col_compensation")}
              </th>
              <th className="py-1.5 font-medium">{tk("col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                data-case-search-hit={searchHitIds?.has(c.id) ? "1" : undefined}
                className={`cursor-pointer border-b ${
                  c.status === CaseStatus.SUBMITTED
                    ? "border-blue-400/30 bg-blue-400/8 hover:bg-[var(--bg)]/80"
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
                <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedCaseIds.includes(c.id)}
                    onChange={(e) => toggleCaseSelection(c.id, e.target.checked)}
                    aria-label={tk("reviewer_batch_select")}
                  />
                </td>
                <td className="py-1.5 pr-2 font-mono font-medium text-[var(--text)]">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.isReference && (
                      <span
                        title={tk("case_reference")}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-yellow-500 bg-yellow-300 px-1 text-[11px] font-bold leading-none text-yellow-950 shadow-sm"
                      >
                        ★
                      </span>
                    )}
                    <CaseDetailLink
                      caseDbId={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(c.id);
                      }}
                      className="font-mono font-medium text-[var(--text)] underline-offset-2 hover:underline"
                    >
                      {c.caseId}
                    </CaseDetailLink>
                    <CopyTextButton lang={lang} value={c.caseId} />
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-[var(--muted)]">
                  <span className="line-clamp-2" title={c.scopeOfWork}>
                    {c.scopeOfWork}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-[var(--muted)]">{c.annotator?.name ?? "—"}</td>
                <td className="py-1.5 pr-2 font-medium text-[var(--text)]">
                  {tk(`status_${c.status}` as DictKey)}
                </td>
                <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">{formatDate(lang, c.completedAt)}</td>
                <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">{c.annotationMinutes ?? "—"}</td>
                <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                  <CaseRowCompensation lang={lang} c={c} />
                </td>
                <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    {c.status === CaseStatus.AVAILABLE && !c.isReference && (
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
                    {c.status === CaseStatus.AVAILABLE && !c.annotator && (
                      <button
                        type="button"
                        className="rounded border border-[var(--danger)]/50 bg-[var(--danger)]/15 px-1.5 py-0.5 text-[var(--danger)] hover:bg-[var(--danger)]/25"
                        onClick={() => removeAvailableCase(c.id)}
                      >
                        {tk("reviewer_delete_case")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[var(--text)] hover:border-[var(--accent)]"
                      onClick={() => {
                        setErr(null);
                        setNoteCaseId(c.id);
                        resetNoteComposer();
                      }}
                    >
                      <CommentActionLabel label={tk("action_comment")} count={c.caseNoteCount} />
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
                    <button
                      type="button"
                      className="rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                      onClick={() => openAnnotatorDetail(c.id)}
                    >
                      {tk("action_annotate")}
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

  function renderGroupedNodes(nodes: GroupNode[], ancestors: string[] = []): ReactElement[] {
    return nodes.map((node) => {
      const parts = [...ancestors, node.key];
      const pathStr = makeTreePath(parts);
      const isScopeGroup = node.key.startsWith("scope:");
      return (
        <details
          key={pathStr}
          data-tree-path={pathStr}
          className="rounded-md border border-[var(--border)]/60 bg-[var(--surface)]"
        >
          <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-[var(--text)] hover:text-[var(--accent)]">
            <span>{node.label}</span> <span>(</span>
            <ReviewerStatusCounts cases={node.cases} />
            <span>)</span>
          </summary>
          <div className="space-y-2 border-t border-[var(--border)]/60 px-1 pb-1 pt-2">
            {isScopeGroup && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--bg)] px-2 py-1.5">
                <span className="text-xs text-[var(--muted)]">
                  {node.cases.length} {tk("reviewer_annotator_view_cases")}
                </span>
                <button
                  type="button"
                  onClick={() => openBatchEditForRows(node.cases)}
                  className="rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  {tk("reviewer_batch_edit_scope")}
                </button>
              </div>
            )}
            {node.children.length > 0
              ? renderGroupedNodes(node.children, parts)
              : renderCaseTable(node.cases, reviewerSearchHitIds)}
          </div>
        </details>
      );
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{tk("reviewer_board_title")}</h2>
      <p className="text-sm text-[var(--muted)]">{tk("reviewer_board_hint")}</p>
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            {tk("clear_search")}
          </button>
        </div>
      </div>
      {statusFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm">
          <span className="text-[var(--text)]">
            {tk("case_status")}:{" "}
            {statusFilter === CaseStatus.SUBMITTED
              ? tk("reviewer_cases_submitted_pending")
              : statusLabel(lang, statusFilter)}
          </span>
          <button
            type="button"
            onClick={clearStatusFilter}
            className="rounded-md border border-[var(--accent)]/40 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/15"
          >
            {tk("clear_search")}
          </button>
        </div>
      )}
      <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={showInactiveProjects}
          onChange={(e) => setShowInactiveProjects(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg)]"
        />
        <span>{tk("annotator_show_inactive_projects")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
        <span className="text-[var(--muted)]">
          {tk("reviewer_batch_selected")}: {selectedCaseIds.length}
        </span>
        <button
          type="button"
          disabled={selectedCaseIds.length === 0}
          onClick={openBatchEdit}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white disabled:opacity-50"
        >
          {tk("reviewer_batch_edit")}
        </button>
        <button
          type="button"
          disabled={selectedCaseIds.length === 0}
          onClick={clearSelection}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
        >
          {tk("clear_search")}
        </button>
        <button
          type="button"
          onClick={() => setShowGroupingControls((prev) => !prev)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
        >
          Change grouping order
        </button>
      </div>
      {showGroupingControls && (
        <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          {groupOrder.map((dim, index) => (
            <label key={`group-level-${index}`} className="text-xs">
              <span className="text-[var(--muted)]">Level {index + 1}</span>
              <select
                value={dim}
                onChange={(e) => setGroupDimension(index, e.target.value as GroupDimension)}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              >
                {(["project", "scope", "rbProject", "annotator"] as GroupDimension[]).map((option) => (
                  <option key={option} value={option}>
                    {groupDimensionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {visibleCases.length === 0 ? (
        <p className="text-[var(--muted)]">{tk("no_cases")}</p>
      ) : (
        <div className="space-y-2" ref={groupedTreeRef}>
          {renderGroupedNodes(groupedBoard)}
        </div>
      )}

      {batchEditOpen && (
        <div
          className="fixed inset-0 z-[62] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setBatchEditOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 font-medium">{tk("reviewer_batch_edit")}</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {tk("reviewer_batch_selected")}: {selectedCaseIds.length}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2 text-sm">
                <span className="text-[var(--muted)]">{tk("case_redbrick")}</span>
                <input
                  value={batchRedbrickProject}
                  onChange={(e) => setBatchRedbrickProject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_guide")}</span>
                <select
                  value={batchGuideId}
                  onChange={(e) => setBatchGuideId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                >
                  <option value="">—</option>
                  {guides.map((guide) => (
                    <option key={guide.id} value={guide.id}>
                      {guide.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2 text-sm">
                <span className="text-[var(--muted)]">{tk("case_topic")}</span>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("case_topic_multi_hint")}</p>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
                  {topics.map((topic) => (
                    <label key={topic.id} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={batchTopicIds.includes(topic.id)}
                        onChange={() =>
                          setBatchTopicIds((prev) =>
                            prev.includes(topic.id)
                              ? prev.filter((id) => id !== topic.id)
                              : [...prev, topic.id],
                          )
                        }
                      />
                      <span>{topic.name}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="md:col-span-2 text-sm">
                <span className="text-[var(--muted)]">{tk("case_guideline")}</span>
                <textarea
                  rows={3}
                  value={batchGuideline}
                  onChange={(e) => setBatchGuideline(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
              <label className="md:col-span-2 text-sm">
                <span className="text-[var(--muted)]">{tk("case_videos")}</span>
                <textarea
                  rows={3}
                  value={batchVideoGuideUrls}
                  onChange={(e) => setBatchVideoGuideUrls(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">{tk("case_video_guides_hint")}</p>
              </label>
              <label className="md:col-span-2 text-sm">
                <span className="text-[var(--muted)]">{tk("case_scope")}</span>
                <input
                  list="scope-options-batch"
                  value={batchScopeOfWork}
                  onChange={(e) => setBatchScopeOfWork(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
                <datalist id="scope-options-batch">
                  {scopeOptions.map((scope) => (
                    <option key={scope} value={scope} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_minMinutes_recommended")}</span>
                <input
                  type="number"
                  min={1}
                  value={batchMinMinutes}
                  onChange={(e) => setBatchMinMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_maxMinutes")}</span>
                <input
                  type="number"
                  min={1}
                  value={batchMaxMinutes}
                  onChange={(e) => setBatchMaxMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_compType")}</span>
                <select
                  value={batchCompType}
                  onChange={(e) => setBatchCompType(e.target.value as CompensationType)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                >
                  <option value={CompensationType.PER_CASE}>{tk("comp_per_case")}</option>
                  <option value={CompensationType.PER_MINUTE}>{tk("comp_per_minute")}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_compAmount")}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={batchCompAmount}
                  onChange={(e) => setBatchCompAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">{tk("case_annotatorBonus")}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={batchBonusAmount}
                  onChange={(e) => setBatchBonusAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </label>
            </div>
            {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setBatchEditOpen(false)}
              >
                {tk("drawer_close")}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={submitBatchEdit}
              >
                {tk("reviewer_batch_apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCase && (
        <div
          className={`fixed inset-0 z-50 flex justify-end bg-black/50 transition-opacity duration-75 ${
            detailClosing ? "pointer-events-none opacity-0" : ""
          }`}
          role="presentation"
        >
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
              <span className="text-sm font-medium">
                {detailMode === "annotator" ? tk("action_annotate") : tk("action_details")}
              </span>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={closeDetail}
              >
                {tk("drawer_close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailMode === "annotator" && detailAnnotatorRow ? (
                <AnnotatorCaseDetailPanel
                  lang={lang}
                  row={detailAnnotatorRow}
                  guides={guides}
                  canPostDiscussion
                  mentionOptions={detailMentionOptions}
                  referenceCases={detailReferenceCases}
                />
              ) : (
                <ReviewerCaseDetailPanel
                  lang={lang}
                  c={detailCase}
                  annotators={annotators}
                  guides={guides}
                  topics={topics}
                  scopeOptions={scopeOptions}
                  mentionOptions={detailMentionOptions}
                  referenceCases={detailReferenceCases}
                  scopeOfWorkTemplate={templateByScope.get(detailCase.scopeOfWork.trim()) ?? null}
                  onDeleted={closeDetail}
                />
              )}
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
                            <CaseDetailLink
                              key={c.id}
                              caseDbId={c.id}
                              onClick={() => {
                                closeAnnotatorFocus();
                                openDetail(c.id);
                              }}
                              className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-mono text-[var(--accent)] underline-offset-2 hover:border-[var(--accent)] hover:underline"
                            >
                              {c.caseId}
                            </CaseDetailLink>
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

      {annotatorsPanelOpen && (
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
                            <th className="px-3 py-2 font-medium">{tk("availability_24h")}</th>
                            <th className="px-3 py-2 font-medium">{tk("availability_72h")}</th>
                            <th className="px-3 py-2 font-medium">{tk("availability_7d")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_avg_time")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_avg_difficulty")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_avg_quality")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_cases_done")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_base_compensation")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_bonus_compensation")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_last_month")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_this_month")}</th>
                            <th className="px-3 py-2 font-medium">{tk("dash_all_time")}</th>
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
                              {[("24h" as const), ("72h" as const), ("7d" as const)].map((key) => {
                                const window = getCapacityWindow(annotator, key);
                                return (
                                  <td key={key} className="px-3 py-2">
                                    <div className="font-medium tabular-nums text-[var(--text)]">
                                      {window.availableHours.toFixed(1)}h
                                    </div>
                                    <div
                                      className={`text-xs tabular-nums ${
                                        window.remainingHours < 0
                                          ? "text-[var(--danger)]"
                                          : "text-[var(--muted)]"
                                      }`}
                                    >
                                      {window.remainingHours.toFixed(1)}h {tk("availability_left")}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatMinutes(lang, annotator.stats.averageTime)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatRating(annotator.stats.averageDifficulty)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatRating(annotator.stats.averageQuality)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {annotator.compensation.auditedCount}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatCompensationAmount(lang, annotator.compensation.baseAllTime)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatCompensationAmount(lang, annotator.compensation.bonusAllTime)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatCompensationAmount(lang, annotator.compensation.lastMonth)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                                {formatCompensationAmount(lang, annotator.compensation.thisMonth)}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-[var(--text)]">
                                {formatCompensationAmount(lang, annotator.compensation.allTime)}
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
                      {[("24h" as const), ("72h" as const), ("7d" as const)].map((key) => {
                        const window = getCapacityWindow(selectedAnnotator, key);
                        return (
                          <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                            <p className="text-xs text-[var(--muted)]">
                              {tk(`availability_${key}` as DictKey)}
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                              {window.availableHours.toFixed(1)}h
                            </p>
                            <p
                              className={`mt-1 text-xs tabular-nums ${
                                window.remainingHours < 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"
                              }`}
                            >
                              {window.remainingHours.toFixed(1)}h {tk("availability_left")}
                            </p>
                          </div>
                        );
                      })}
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
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_cases_done")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {selectedAnnotator.compensation.auditedCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_base_compensation")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatCompensationAmount(lang, selectedAnnotator.compensation.baseAllTime)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_bonus_compensation")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatCompensationAmount(lang, selectedAnnotator.compensation.bonusAllTime)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_last_month")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatCompensationAmount(lang, selectedAnnotator.compensation.lastMonth)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_this_month")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatCompensationAmount(lang, selectedAnnotator.compensation.thisMonth)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-[var(--muted)]">{tk("dash_all_time")}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {formatCompensationAmount(lang, selectedAnnotator.compensation.allTime)}
                        </p>
                      </div>
                    </div>
                    <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-[var(--bg)]">
                        {tk("reviewer_perf_comp_history")}
                      </summary>
                      <div className="border-t border-[var(--border)] p-3">
                        <p className="mb-2 text-xs text-[var(--muted)]">{tk("dash_comp_month_hint")}</p>
                        {selectedAnnotator.compensation.history.length === 0 ? (
                          <p className="text-sm text-[var(--muted)]">{tk("reviewer_perf_no_cases")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left text-xs">
                              <thead>
                                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_month")}</th>
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_audited_cases")}</th>
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_total_time")}</th>
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_avg_pay_per_hour")}</th>
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_base_compensation")}</th>
                                  <th className="py-1.5 pr-2 font-medium">{tk("dash_bonus_compensation")}</th>
                                  <th className="py-1.5 font-medium">{tk("dash_project_total")}</th>
                                </tr>
                              </thead>
                              {selectedAnnotator.compensation.history.map((row) => {
                                const isExpanded = expandedCompMonthKey === row.monthKey;
                                return (
                                  <tbody key={row.monthKey}>
                                    <tr
                                      className={`cursor-pointer border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)] ${
                                        isExpanded ? "bg-[var(--bg)]" : ""
                                      }`}
                                      onClick={() =>
                                        setExpandedCompMonthKey((current) =>
                                          current === row.monthKey ? null : row.monthKey,
                                        )
                                      }
                                    >
                                      <td className="py-1.5 pr-2 text-[var(--text)]">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span aria-hidden className="text-[var(--muted)]">
                                            {isExpanded ? "▾" : "▸"}
                                          </span>
                                          {row.label}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                                        {row.auditedCount}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">
                                        {formatHours(
                                          lang,
                                          row.totalMinutes > 0 ? row.totalMinutes / 60 : null,
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                                        {row.averagePayPerHour == null
                                          ? "—"
                                          : formatCompensationAmount(lang, row.averagePayPerHour)}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                                        {formatCompensationAmount(lang, row.baseCompensation)}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums text-[var(--text)]">
                                        {formatCompensationAmount(lang, row.bonusCompensation)}
                                      </td>
                                      <td className="py-1.5 tabular-nums text-[var(--text)]">
                                        {formatCompensationAmount(lang, row.totalCompensation)}
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={7} className="bg-[var(--bg)] px-2 pb-3 pt-1">
                                          <table className="w-full min-w-[560px] text-left text-xs">
                                            <thead>
                                              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                                                <th className="py-1 pr-2 font-medium">
                                                  {tk("dash_project_col")}
                                                </th>
                                                <th className="py-1 pr-2 font-medium">
                                                  {tk("col_case_id")}
                                                </th>
                                                <th className="py-1 pr-2 font-medium">
                                                  {tk("col_submittedAt")}
                                                </th>
                                                <th className="py-1 pr-2 font-medium">
                                                  {tk("dash_base_compensation")}
                                                </th>
                                                <th className="py-1 pr-2 font-medium">
                                                  {tk("dash_bonus_compensation")}
                                                </th>
                                                <th className="py-1 font-medium">
                                                  {tk("dash_project_total")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {row.cases.map((c) => {
                                                const payInputs = {
                                                  compensationType: c.compensationType,
                                                  compensationAmount: c.compensationAmount,
                                                  annotationMinutes: c.annotationMinutes,
                                                  minMinutesPerCase: c.minMinutesPerCase,
                                                  maxMinutesPerCase: c.maxMinutesPerCase,
                                                  annotatorBonus: c.bonusCompensation,
                                                  wasResubmitted: c.wasResubmitted,
                                                };
                                                return (
                                                  <tr
                                                    key={c.caseDbId}
                                                    className="border-b border-[var(--border)]/40 last:border-0"
                                                  >
                                                    <td className="py-1 pr-2 text-[var(--text)]">
                                                      {c.project}
                                                    </td>
                                                    <td
                                                      className="py-1 pr-2"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <CaseDetailLink caseDbId={c.caseDbId}>
                                                        {c.caseId}
                                                      </CaseDetailLink>
                                                    </td>
                                                    <td className="py-1 pr-2 whitespace-nowrap text-[var(--muted)]">
                                                      {formatDate(lang, c.submittedAt)}
                                                    </td>
                                                    <td
                                                      className="py-1 pr-2"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <CaseCompensationAmountButton
                                                        lang={lang}
                                                        amount={c.baseCompensation}
                                                        inputs={payInputs}
                                                        title={c.caseId}
                                                      />
                                                    </td>
                                                    <td
                                                      className="py-1 pr-2"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <CaseCompensationAmountButton
                                                        lang={lang}
                                                        amount={c.bonusCompensation}
                                                        inputs={payInputs}
                                                        title={c.caseId}
                                                      />
                                                    </td>
                                                    <td
                                                      className="py-1"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <CaseCompensationAmountButton
                                                        lang={lang}
                                                        amount={c.totalCompensation}
                                                        inputs={payInputs}
                                                        title={c.caseId}
                                                      />
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                );
                              })}
                            </table>
                          </div>
                        )}
                      </div>
                    </details>
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
                                              <CaseDetailLink
                                                caseDbId={c.id}
                                                amendSearch={(p) => {
                                                  p.delete("annotators");
                                                }}
                                                onClick={() => {
                                                  setSelectedAnnotatorId(null);
                                                  setSelectedProject(null);
                                                  openDetail(c.id, (p) => {
                                                    p.delete("annotators");
                                                  });
                                                }}
                                                className="rounded px-0.5 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                                              >
                                                {c.caseId}
                                              </CaseDetailLink>
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
                                            <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                                              <CaseRowCompensation lang={lang} c={c} />
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
                                                <button
                                                  type="button"
                                                  className="rounded border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                                                  onClick={() => {
                                                    setSelectedAnnotatorId(null);
                                                    setSelectedProject(null);
                                                    openAnnotatorDetail(c.id);
                                                  }}
                                                >
                                                  {tk("action_annotate")}
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
                                                {c.status === CaseStatus.AVAILABLE && !c.annotator && (
                                                  <button
                                                    type="button"
                                                    className="rounded border border-[var(--danger)]/50 bg-[var(--danger)]/15 px-1.5 py-0.5 text-[var(--danger)] hover:bg-[var(--danger)]/25"
                                                    onClick={() => removeAvailableCase(c.id)}
                                                  >
                                                    {tk("reviewer_delete_case")}
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
            <p className="mb-2 text-xs text-[var(--muted)]">
              <CaseDetailLink
                caseDbId={noteCase.id}
                onClick={() => {
                  setNoteCaseId(null);
                  resetNoteComposer();
                  setErr(null);
                  openDetail(noteCase.id);
                }}
                className="font-mono font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {noteCase.caseId}
              </CaseDetailLink>
            </p>
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
            {audit.decision === "ACCEPT" &&
              (() => {
                const auditCase = cases.find((x) => x.id === audit.caseId);
                return (
                  auditCase != null &&
                  (auditCase.wasResubmitted || caseWasResubmitted(auditCase.reviews))
                );
              })() && (
                <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--text)]">
                  {tk("pay_calc_resubmit_note")}
                </p>
              )}
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
              onChange={(rating) => {
                setAuditQualityRating(rating);
                if (audit.decision !== "ACCEPT") {
                  setAuditAnnotatorBonus("");
                  return;
                }
                const auditCase = cases.find((c) => c.id === audit.caseId);
                if (!auditCase) {
                  setAuditAnnotatorBonus("0");
                  return;
                }
                setAuditAnnotatorBonus(
                  String(
                    suggestedQualityAdjustment(
                      rating,
                      computeCaseBasePay(
                        auditCase.compensationType,
                        auditCase.compensationAmount,
                        auditCase.minMinutesPerCase,
                        auditCase.maxMinutesPerCase,
                      ),
                      {
                        wasResubmitted:
                          auditCase.wasResubmitted || caseWasResubmitted(auditCase.reviews),
                      },
                    ),
                  ),
                );
              }}
              required
            />
            {audit.decision === "ACCEPT" && auditQualityRating != null && (
              <label className="mb-2 block">
                <span className="text-sm text-[var(--muted)]">{tk("case_quality_adjustment")}</span>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("review_quality_adjustment_hint")}</p>
                <input
                  type="number"
                  step="0.01"
                  value={auditAnnotatorBonus}
                  onChange={(e) => setAuditAnnotatorBonus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                />
              </label>
            )}
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
