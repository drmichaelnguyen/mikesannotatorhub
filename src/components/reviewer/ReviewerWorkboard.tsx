"use client";

import { CaseQualityBonusField } from "@/components/CaseQualityBonusField";
import { CaseTimingFields } from "@/components/CaseTimingFields";
import { createCaseErrorMessage } from "@/lib/create-case-errors";
import { isValidFiveStarBonusPercent } from "@/lib/project-quality-bonus";
import { rushPercentFromHours } from "@/lib/compensation";
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
  type InputHTMLAttributes,
} from "react";
import {
  adminCompleteCaseAction,
  batchDeleteCasesAction,
  batchUpdateCasesAction,
  deleteCaseAction,
  reviewCaseAction,
  reviewerAssignCaseAction,
} from "@/app/actions/cases";
import { MentionTextarea } from "@/components/MentionTextarea";
import { CaseDetailLink } from "@/components/CaseDetailLink";
import {
  CaseDetailsFields,
  type CaseDetailsFieldsValue,
} from "@/components/CaseDetailsFields";
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
import { matchContinuityReportFileToCaseId } from "@/lib/continuity-report-filename";
import {
  looksLikeRadiologistFindingsTable,
  matchFindingsToCaseIds,
  parseRadiologistFindingsTable,
} from "@/lib/radiologist-findings";
import { StarRating } from "@/components/StarRating";
import { ReviewerCaseDetailPanel } from "@/components/reviewer/ReviewerCaseDetailPanel";
import { getClipboardImageFile, getClipboardImageFiles, readFileAsDataUrl, readFilesAsDataUrls } from "@/lib/client-image-data";
import {
  caseRushForfeitReason,
  caseRushPercent,
  computeCaseBasePay,
  computeCompensation,
  computeTimeCompensation,
  suggestedQualityAdjustment,
} from "@/lib/compensation";
import { CaseCompensationAmountButton } from "@/components/CaseCompensationBreakdown";
import {
  formatCompensationAmount,
  formatDate,
  formatHours,
  formatMinutes,
} from "@/lib/format";
import { buildMentionOptionsForCase, type GuideOptionLite, type TopicOptionLite } from "@/lib/guide-topic";
import { parseVideoGuideUrlsInput } from "@/lib/video-guides";
import type { SerializedReviewerCase } from "@/lib/reviewer-serialize";
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
  const rushPercent = caseRushPercent(c);
  const amount = computeCompensation(
    c.compensationType,
    c.compensationAmount,
    c.annotationMinutes,
    c.maxMinutesPerCase,
    c.minMinutesPerCase,
    c.annotatorBonus,
    rushPercent,
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
        wasResubmitted: c.wasResubmitted,
        rushPercent,
        rushForfeitReason: caseRushForfeitReason(c),
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

type BatchApplyGroupKey = "available" | "unsubmitted" | "rejected" | "submitted" | "completed";

const BATCH_APPLY_GROUPS: {
  key: BatchApplyGroupKey;
  statuses: CaseStatus[];
  labelKey: DictKey;
}[] = [
  { key: "available", statuses: [CaseStatus.AVAILABLE], labelKey: "status_AVAILABLE" },
  {
    key: "unsubmitted",
    statuses: [CaseStatus.ASSIGNED],
    labelKey: "reviewer_batch_apply_unsubmitted",
  },
  { key: "rejected", statuses: [CaseStatus.REJECTED], labelKey: "status_REJECTED" },
  { key: "submitted", statuses: [CaseStatus.SUBMITTED], labelKey: "status_SUBMITTED" },
  {
    key: "completed",
    statuses: [
      CaseStatus.ACCEPTED,
      CaseStatus.AUDITED,
      CaseStatus.ADMIN_COMPLETED,
      CaseStatus.EXPIRED,
    ],
    labelKey: "reviewer_batch_apply_completed",
  },
];

function defaultBatchApplyFilters(): Record<BatchApplyGroupKey, boolean> {
  return {
    available: true,
    unsubmitted: true,
    rejected: true,
    submitted: true,
    completed: true,
  };
}

function batchApplyGroupForStatus(status: CaseStatus): BatchApplyGroupKey | null {
  for (const group of BATCH_APPLY_GROUPS) {
    if (group.statuses.includes(status)) return group.key;
  }
  return null;
}

function rowMatchesBatchApplyFilters(
  row: SerializedReviewerCase,
  filters: Record<BatchApplyGroupKey, boolean>,
): boolean {
  const key = batchApplyGroupForStatus(row.status);
  return key != null && filters[key];
}

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
  rushPercent: number;
  rushForfeitReason: "rejected" | "late" | null;
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
  projects: AnnotatorPerformanceProject[];
};

function getProjectName(c: Pick<SerializedReviewerCase, "project">): string {
  return (c.project || "").trim() || "—";
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
    CaseStatus.EXPIRED,
    CaseStatus.ADMIN_COMPLETED,
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
    const rushPercent = caseRushPercent(c);
    const baseAmount = computeTimeCompensation(
      c.compensationType,
      c.compensationAmount,
      c.annotationMinutes,
      c.maxMinutesPerCase,
      c.minMinutesPerCase,
      rushPercent,
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
      rushPercent,
      rushForfeitReason: caseRushForfeitReason(c),
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
): AnnotatorPerformanceSummary[] {
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
      return {
        ...annotator,
        stats: buildPerformanceStats(mine),
        compensation: buildCompensationPeriods(lang, mine),
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
  guides,
  topics,
  scopeTemplates,
}: {
  lang: Lang;
  cases: SerializedReviewerCase[];
  annotators: { id: string; name: string; email: string }[];
  guides: GuideOptionLite[];
  topics: TopicOptionLite[];
  scopeTemplates: {
    scopeOfWork: string;
    template: string;
    requireImagePerEntry: boolean;
    commentChoiceMode: string;
    commentChoices: string;
    commentFieldConfigs: string;
  }[];
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
  useEffect(() => {
    const now = Date.now();
    const nextExpiry = cases
      .filter(
        (c) =>
          c.expiresAt &&
          (c.status === CaseStatus.AVAILABLE ||
            c.status === CaseStatus.ASSIGNED ||
            c.status === CaseStatus.REJECTED),
      )
      .map((c) => new Date(c.expiresAt!).getTime())
      .filter((time) => Number.isFinite(time) && time > now)
      .sort((a, b) => a - b)[0];
    if (nextExpiry == null) return;
    const timer = window.setTimeout(
      () => router.refresh(),
      Math.min(nextExpiry - now + 250, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [cases, router]);
  const searchedCases = useMemo(() => {
    const needle = searchNeedle.toLowerCase();
    if (!needle) return cases;
    return cases.filter(
      (c) =>
        c.id.toLowerCase().includes(needle) ||
        c.caseId.toLowerCase().includes(needle) ||
        (c.project || "").trim().toLowerCase().includes(needle) ||
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
          (row.status !== CaseStatus.AUDITED &&
            row.status !== CaseStatus.ACCEPTED &&
            row.status !== CaseStatus.EXPIRED &&
            row.status !== CaseStatus.ADMIN_COMPLETED),
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

  const projectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cases
            .map((c) => c.project.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [cases],
  );

  const rbProjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cases
            .map((c) => c.redbrickProject.trim())
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
  const [auditBonusOverridden, setAuditBonusOverridden] = useState(false);
  const [auditAnnotatorBonus, setAuditAnnotatorBonus] = useState("");
  const [auditRawImage, setAuditRawImage] = useState<string | null>(null);
  const [auditMarkedImage, setAuditMarkedImage] = useState<string | null>(null);
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignAnnotatorId, setAssignAnnotatorId] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchEditPool, setBatchEditPool] = useState<SerializedReviewerCase[]>([]);
  const [batchApplyFilters, setBatchApplyFilters] = useState(defaultBatchApplyFilters);
  const [batchDetails, setBatchDetails] = useState<CaseDetailsFieldsValue>({
    project: "",
    redbrickProject: "",
    guideId: "",
    topicIds: [],
    guideline: "",
    radiologistFinding: "",
    videoGuideUrls: "",
    scopeOfWork: "",
    minMinutesPerCase: "",
    maxMinutesPerCase: "",
    compensationType: "PER_MINUTE",
    compensationAmount: "",
  });
  const [batchFindingsPaste, setBatchFindingsPaste] = useState("");
  const [batchBonusAmount, setBatchBonusAmount] = useState("");
  const [batchQualityBonus, setBatchQualityBonus] = useState("");
  const [batchQualityChanged, setBatchQualityChanged] = useState(false);
  const [batchUpdateTiming, setBatchUpdateTiming] = useState(false);
  const [batchDeadlineHours, setBatchDeadlineHours] = useState(72);
  const [batchGraceHours, setBatchGraceHours] = useState(8);
  const [batchTimingStart, setBatchTimingStart] = useState(0);
  const batchErrorRef = useRef<HTMLDivElement>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [batchAssignment, setBatchAssignment] = useState("KEEP");
  const [batchContinuityFiles, setBatchContinuityFiles] = useState<File[]>([]);
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
        scopeTemplates.map((item) => [
          item.scopeOfWork.trim(),
          {
            template: item.template,
            requireImagePerEntry: item.requireImagePerEntry,
            commentChoiceMode: item.commentChoiceMode,
            commentChoices: item.commentChoices,
            commentFieldConfigs: item.commentFieldConfigs,
          },
        ] as const),
      ),
    [scopeTemplates],
  );

  const detailCase = detailId ? cases.find((c) => c.id === detailId) ?? null : null;
  useEffect(() => {
    if (batchEditOpen && err && !pending) batchErrorRef.current?.focus();
  }, [batchEditOpen, err, pending]);

  const batchTargetRows = useMemo(
    () => batchEditPool.filter((row) => rowMatchesBatchApplyFilters(row, batchApplyFilters)),
    [batchEditPool, batchApplyFilters],
  );
  const batchApplyCounts = useMemo(() => {
    const counts = Object.fromEntries(
      BATCH_APPLY_GROUPS.map((group) => [group.key, 0]),
    ) as Record<BatchApplyGroupKey, number>;
    for (const row of batchEditPool) {
      const key = batchApplyGroupForStatus(row.status);
      if (key) counts[key] += 1;
    }
    return counts;
  }, [batchEditPool]);
  const batchApplyAllChecked = BATCH_APPLY_GROUPS.every((group) => batchApplyFilters[group.key]);
  const batchApplyIndeterminate =
    !batchApplyAllChecked && BATCH_APPLY_GROUPS.some((group) => batchApplyFilters[group.key]);
  const batchContinuityPreview = useMemo(() => {
    const caseIds = batchTargetRows.map((row) => row.caseId);
    const matched: { caseId: string; filename: string }[] = [];
    const unmatched: string[] = [];
    const usedCaseIds = new Set<string>();
    for (const file of batchContinuityFiles) {
      const caseId = matchContinuityReportFileToCaseId(file.name, caseIds);
      if (!caseId || usedCaseIds.has(caseId)) {
        unmatched.push(file.name);
        continue;
      }
      usedCaseIds.add(caseId);
      matched.push({ caseId, filename: file.name });
    }
    return { matched, unmatched };
  }, [batchContinuityFiles, batchTargetRows]);
  const batchFindingsPreview = useMemo(() => {
    const parsed = parseRadiologistFindingsTable(batchFindingsPaste);
    return matchFindingsToCaseIds(
      parsed,
      batchTargetRows.map((row) => row.caseId),
    );
  }, [batchFindingsPaste, batchTargetRows]);

  const detailAnnotatorRow = useMemo(() => {
    if (!detailCase) return null;
    const tmpl = templateByScope.get(detailCase.scopeOfWork.trim());
    return {
      ...detailCase,
      _count: {
        caseNotes: detailCase.caseNoteCount,
        reviews: detailCase.wasResubmitted ? 1 : 0,
      },
      scopeOfWorkTemplate: tmpl?.template ?? null,
      scopeOfWorkTemplateRequiresImages: tmpl?.requireImagePerEntry ?? false,
      commentChoiceMode: tmpl?.commentChoiceMode ?? "FREE",
      commentChoices: tmpl?.commentChoices ?? "",
      commentFieldConfigs: tmpl?.commentFieldConfigs ?? "[]",
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
    () => buildAnnotatorPerformance(lang, annotators, cases),
    [lang, annotators, cases],
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

  function adminCompleteCase(caseDbId: string) {
    if (!window.confirm(tk("reviewer_admin_complete_confirm"))) return;
    setErr(null);
    start(async () => {
      const res = await adminCompleteCaseAction(caseDbId);
      if (!res.ok) {
        setErr(res.error === "state" ? tk("reviewer_admin_complete_taken") : tk("required"));
        return;
      }
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

  function toggleSelectAllInTable(rows: SerializedReviewerCase[], checked: boolean) {
    const rowIds = rows.map((row) => row.id);
    setSelectedCaseIds((prev) => {
      if (!checked) return prev.filter((id) => !rowIds.includes(id));
      const next = new Set(prev);
      for (const id of rowIds) next.add(id);
      return [...next];
    });
  }

  function tableSelectionState(rows: SerializedReviewerCase[]) {
    const rowIds = rows.map((row) => row.id);
    const selectedCount = rowIds.filter((id) => selectedCaseIds.includes(id)).length;
    if (selectedCount === 0) return { all: false, indeterminate: false };
    if (selectedCount === rowIds.length) return { all: true, indeterminate: false };
    return { all: false, indeterminate: true };
  }

  function clearSelection() {
    setSelectedCaseIds([]);
  }

  function openBatchEditForRows(rows: SerializedReviewerCase[]) {
    if (rows.length === 0) return;
    setBatchEditPool(rows);
    setBatchApplyFilters(defaultBatchApplyFilters());
    setSelectedCaseIds(rows.map((row) => row.id));
    const sharedFinding = sameValue(rows, (row) => row.radiologistFinding) ?? "";
    const sharedIsTable = looksLikeRadiologistFindingsTable(sharedFinding);
    setBatchDetails({
      project: sameValue(rows, (row) => row.project) ?? "",
      redbrickProject: sameValue(rows, (row) => row.redbrickProject) ?? "",
      guideId: sameValue(rows, (row) => row.guide?.id ?? "") ?? "",
      topicIds: sameTopicIds(rows),
      guideline: sameValue(rows, (row) => row.guideline) ?? "",
      radiologistFinding: sharedIsTable ? "" : sharedFinding,
      videoGuideUrls: sameValue(rows, (row) => row.videoGuideUrls.join("\n")) ?? "",
      scopeOfWork: sameValue(rows, (row) => row.scopeOfWork) ?? "",
      minMinutesPerCase: String(sameValue(rows, (row) => row.minMinutesPerCase) ?? ""),
      maxMinutesPerCase: String(sameValue(rows, (row) => row.maxMinutesPerCase) ?? ""),
      compensationType: sameValue(rows, (row) => row.compensationType) ?? "PER_MINUTE",
      compensationAmount: String(sameValue(rows, (row) => row.compensationAmount) ?? ""),
    });
    setBatchBonusAmount("");
    setBatchQualityBonus(String(sameValue(rows, row => row.fiveStarBonusPercent ?? 15) ?? ""));
    setBatchQualityChanged(false);
    setBatchUpdateTiming(false);
    setBatchDeadlineHours(72);
    setBatchGraceHours(8);
    setBatchTimingStart(Date.now());
    setBatchSuccess(null);
    setBatchAssignment("KEEP");
    setBatchContinuityFiles([]);
    setBatchFindingsPaste(sharedIsTable ? sharedFinding : "");
    setErr(null);
    setBatchEditOpen(true);
  }

  function openBatchEdit() {
    if (selectedCaseIds.length === 0) return;
    const selectedRows = cases.filter((row) => selectedCaseIds.includes(row.id));
    openBatchEditForRows(selectedRows);
  }

  function removeSelectedCases() {
    if (selectedCaseIds.length === 0) return;
    const removableRows = cases.filter(
      (row) =>
        selectedCaseIds.includes(row.id) &&
        row.status === CaseStatus.AVAILABLE &&
        !row.annotator &&
        !row.isReference,
    );
    if (removableRows.length === 0) {
      setErr(tk("reviewer_batch_remove_none"));
      return;
    }
    const confirmMessage = tk("reviewer_batch_remove_confirm").replace(
      "{count}",
      String(removableRows.length),
    );
    if (!window.confirm(confirmMessage)) return;

    setErr(null);
    start(async () => {
      const res = await batchDeleteCasesAction(selectedCaseIds);
      if (!res.ok) {
        setErr(res.error === "none_removable" ? tk("reviewer_batch_remove_none") : tk("required"));
        return;
      }
      if (detailId && selectedCaseIds.includes(detailId)) closeDetail();
      clearSelection();
      refresh();
    });
  }

  function setBatchApplyAll(checked: boolean) {
    setBatchApplyFilters(
      Object.fromEntries(BATCH_APPLY_GROUPS.map((group) => [group.key, checked])) as Record<
        BatchApplyGroupKey,
        boolean
      >,
    );
  }

  function toggleBatchApplyGroup(key: BatchApplyGroupKey, checked: boolean) {
    setBatchApplyFilters((prev) => ({ ...prev, [key]: checked }));
  }

  function submitBatchEdit() {
    if (batchTargetRows.length === 0) {
      setErr(tk("reviewer_batch_apply_none"));
      return;
    }
    const minMinutesPerCase = Number(batchDetails.minMinutesPerCase);
    const maxMinutesPerCase = Number(batchDetails.maxMinutesPerCase);
    const compensationAmount =
      batchDetails.compensationAmount.trim() === ""
        ? null
        : Number(batchDetails.compensationAmount);
    const annotatorBonus = batchBonusAmount.trim() === "" ? null : Number(batchBonusAmount);
    const fiveStarBonusPercent = !batchQualityChanged || batchQualityBonus.trim() === "" ? null : Number(batchQualityBonus);
    if (fiveStarBonusPercent !== null && !isValidFiveStarBonusPercent(fiveStarBonusPercent)) {
      setErr(createCaseErrorMessage("quality_bonus", lang));
      return;
    }
    const deadline = new Date(batchTimingStart + batchDeadlineHours * 3600000);
    const expiresAt = new Date(batchTimingStart + (batchDeadlineHours + batchGraceHours) * 3600000);
    if (
      !Number.isFinite(minMinutesPerCase) ||
      !Number.isFinite(maxMinutesPerCase) ||
      (compensationAmount != null && !Number.isFinite(compensationAmount)) ||
      (annotatorBonus !== null && !Number.isFinite(annotatorBonus)) ||
      Number.isNaN(deadline.getTime()) ||
      Number.isNaN(expiresAt.getTime())
    ) {
      setErr(createCaseErrorMessage("limits", lang));
      return;
    }
    if (expiresAt <= deadline) {
      setErr(tk("case_expiry_required"));
      return;
    }
    setErr(null);
    start(async () => {
      try {
        const uploadBytes = batchContinuityFiles.reduce((total, file) => total + file.size, 0) + new Blob([JSON.stringify(batchDetails), batchFindingsPaste]).size;
        if (uploadBytes > 15 * 1024 * 1024) { setErr(createCaseErrorMessage("upload_size", lang)); return; }
        const continuityReportFormData = new FormData();
        for (const file of batchContinuityFiles) {
          continuityReportFormData.append("continuityReports", file);
        }
        const findingsParsed = parseRadiologistFindingsTable(batchFindingsPaste);
        const batchTargetIds = batchTargetRows.map((row) => row.id);
        const findingsByCaseId = Object.fromEntries(
          matchFindingsToCaseIds(
            findingsParsed,
            batchTargetRows.map((row) => row.caseId),
          ).matched.map((m) => [m.caseId, m.finding]),
        );
        const res = await batchUpdateCasesAction(
          {
            caseDbIds: batchTargetIds,
            project: batchDetails.project,
            redbrickProject: batchDetails.redbrickProject,
            guideId: batchDetails.guideId,
            topicIds: batchDetails.topicIds,
            guideline: batchDetails.guideline,
            radiologistFinding: batchDetails.radiologistFinding,
            findingsByCaseId,
            videoGuideUrls: parseVideoGuideUrlsInput(batchDetails.videoGuideUrls),
            scopeOfWork: batchDetails.scopeOfWork,
            minMinutesPerCase,
            maxMinutesPerCase,
            compensationType: batchDetails.compensationType,
            compensationAmount,
            annotatorBonus,
            fiveStarBonusPercent,
            deadline: batchUpdateTiming ? deadline.toISOString() : null,
            expiresAt: batchUpdateTiming ? expiresAt.toISOString() : null,
            assignment: batchAssignment,
          },
          continuityReportFormData,
        );
        if (!res.ok) {
          const message = res.error === "assignment_state" ? tk("reviewer_assign_taken")
            : res.error === "invalid_annotator" ? tk("reviewer_assign_invalid")
            : res.error === "no_cases" ? tk("reviewer_batch_apply_none")
            : res.error === "server" ? (lang === "vi" ? "Máy chủ không thể hoàn tất cập nhật. Kiểm tra danh sách trước khi thử lại; một số thay đổi có thể đã lưu." : "The server could not finish updating cases. Check the case list before retrying; some changes may already be saved.")
            : createCaseErrorMessage(res.error, lang);
          setErr(message + ("referenceId" in res && res.referenceId ? ` (${res.referenceId})` : ""));
          return;
        }
        setBatchSuccess(`${lang === "vi" ? "Đã cập nhật" : "Updated"} ${res.updated} ${lang === "vi" ? "ca" : "cases"}. ${lang === "vi" ? "Báo cáo đính kèm" : "Reports attached"}: ${res.continuityReportsAttached}.${res.continuityReportsUnmatched.length ? ` ${tk("case_continuity_report_preview_unmatched")}: ${res.continuityReportsUnmatched.join(", ")}` : ""}`);
        setBatchEditOpen(false);
        clearSelection();
        refresh();
      } catch {
        setErr(lang === "vi" ? "Không thể hoàn tất cập nhật. Kiểm tra danh sách ca trước khi thử lại; một số thay đổi có thể đã lưu. Nội dung nhập vẫn được giữ." : "Could not finish updating cases. Check the case list before retrying; some changes may already be saved. Your entries are still here.");
      }
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
                  caseRushPercent(auditCase),
                ),
                {
                  wasResubmitted: auditCase.wasResubmitted,
                  fiveStarBonusPercent: auditCase.fiveStarBonusPercent,
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
        annotatorBonus: auditBonusOverridden ? bonus : undefined,
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
    const selection = tableSelectionState(rows);
    return (
      <div className="overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text)]">
              <th className="py-1.5 pr-2 font-medium">
                <input
                  type="checkbox"
                  checked={selection.all}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.indeterminate;
                  }}
                  onChange={(e) => toggleSelectAllInTable(rows, e.target.checked)}
                  aria-label={tk("reviewer_batch_select_all")}
                  title={tk("reviewer_batch_select_all")}
                />
              </th>
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
                    {(c.status === CaseStatus.AVAILABLE ||
                      c.status === CaseStatus.ASSIGNED ||
                      c.status === CaseStatus.REJECTED) &&
                      !c.isReference && (
                      <button
                        type="button"
                        className="rounded border border-[var(--muted)]/50 bg-[var(--bg)] px-1.5 py-0.5 text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                        onClick={() => adminCompleteCase(c.id)}
                      >
                        {tk("reviewer_admin_complete")}
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
                            setAuditBonusOverridden(false);
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
                            setAuditBonusOverridden(false);
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
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          selectedCaseIds.length > 0
            ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
            : "border-[var(--border)] bg-[var(--surface)]"
        }`}
      >
        <span className={selectedCaseIds.length > 0 ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}>
          {tk("reviewer_batch_selected")}: {selectedCaseIds.length}
        </span>
        <button
          type="button"
          disabled={selectedCaseIds.length === 0}
          onClick={openBatchEdit}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white disabled:opacity-50"
        >
          {tk("reviewer_batch_edit_details")}
        </button>
        <button
          type="button"
          disabled={selectedCaseIds.length === 0}
          onClick={removeSelectedCases}
          className="rounded-md border border-[var(--danger)]/50 bg-[var(--danger)]/15 px-3 py-1.5 text-[var(--danger)] disabled:opacity-50"
        >
          {tk("reviewer_batch_remove")}
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

      {batchSuccess && <p role="status" className="rounded-md border border-[var(--success)] bg-[var(--surface)] p-3 text-sm">{batchSuccess}</p>}
      {batchEditOpen && (
        <div
          className="fixed inset-0 z-[62] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => { if (!pending) setBatchEditOpen(false); }}
        >
          <form
            role="dialog" aria-modal="true" aria-labelledby="batch-edit-heading" aria-busy={pending}
            onSubmit={event => { event.preventDefault(); submitBatchEdit(); }}
            onInvalidCapture={event => { const input = event.target as HTMLInputElement; setErr(`${input.labels?.[0]?.textContent?.trim() || input.name}: ${input.validationMessage}`); }}
            className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="batch-edit-heading" className="mb-1 text-lg font-medium">{tk("reviewer_batch_edit_details")}</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {tk("reviewer_batch_apply_will_update")}: {batchTargetRows.length} / {batchEditPool.length}
            </p>
            {err && <div ref={batchErrorRef} tabIndex={-1} role="alert" className="mb-3 rounded-md border border-[var(--danger)] bg-[var(--bg)] p-4 text-sm">
              <p className="font-semibold text-[var(--danger)]">{lang === "vi" ? "Chưa thể cập nhật ca" : "We couldn’t update your cases"}</p>
              <p className="mt-1">{err}</p>
            </div>}
            <p className="mb-3 text-xs text-[var(--muted)]">{lang === "vi" ? "Giá trị chung được điền sẵn. Các trường khác nhau có thể trống; nội dung gửi sẽ thay thế trên tất cả ca đã chọn. Tỷ lệ 5★, lịch và khoản điều chỉnh đã duyệt được giữ trừ khi bạn sửa." : "Shared values are prefilled. Fields that differ may be blank; submitted details replace them on every selected case. Existing 5★ rates, schedules, and saved review adjustments stay as they are unless you change them."}</p>
            <fieldset disabled={pending}>
            <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
              <p className="text-sm font-medium text-[var(--text)]">{tk("reviewer_batch_apply_to")}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("reviewer_batch_apply_to_hint")}</p>
              <div className="mt-2 space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={batchApplyAllChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = batchApplyIndeterminate;
                    }}
                    onChange={(e) => setBatchApplyAll(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)] bg-[var(--surface)]"
                  />
                  <span>
                    {tk("reviewer_batch_apply_all")} ({batchEditPool.length})
                  </span>
                </label>
                <div className="ml-6 space-y-1.5 border-l border-[var(--border)] pl-3">
                  {BATCH_APPLY_GROUPS.map((group) => (
                    <label key={group.key} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input
                        type="checkbox"
                        checked={batchApplyFilters[group.key]}
                        disabled={batchApplyCounts[group.key] === 0}
                        onChange={(e) => toggleBatchApplyGroup(group.key, e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--border)] bg-[var(--surface)] disabled:opacity-40"
                      />
                      <span>
                        {tk(group.labelKey)} ({batchApplyCounts[group.key]})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <span className="text-sm text-[var(--muted)]">{tk("case_ids_batch")}</span>
                <div className="mt-1 max-h-24 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs">
                  {batchTargetRows.length > 0
                    ? batchTargetRows.map((row) => row.caseId).join(", ")
                    : tk("reviewer_batch_apply_none")}
                </div>
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="batch-case-continuity-reports"
                  className="text-sm text-[var(--muted)]"
                >
                  {tk("case_continuity_report_upload")}
                </label>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {tk("case_continuity_report_upload_hint")}
                </p>
                <input
                  id="batch-case-continuity-reports"
                  type="file"
                  multiple
                  accept=".html,text/html"
                  className="mt-2 block w-full text-sm"
                  onChange={(e) =>
                    setBatchContinuityFiles(Array.from(e.target.files ?? []))
                  }
                  {...({
                    webkitdirectory: "",
                    directory: "",
                  } as InputHTMLAttributes<HTMLInputElement>)}
                />
                {(batchContinuityPreview.matched.length > 0 ||
                  batchContinuityPreview.unmatched.length > 0) && (
                  <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
                    {batchContinuityPreview.matched.length > 0 && (
                      <p>
                        <span className="font-medium">
                          {tk("case_continuity_report_preview_matched")}:
                        </span>{" "}
                        {batchContinuityPreview.matched
                          .map((row) => `${row.caseId} ← ${row.filename}`)
                          .join(", ")}
                      </p>
                    )}
                    {batchContinuityPreview.unmatched.length > 0 && (
                      <p className="mt-1 text-[var(--warn)]">
                        {tk("case_continuity_report_preview_unmatched")}:{" "}
                        {batchContinuityPreview.unmatched.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label htmlFor="batch-case-rad-findings" className="text-sm text-[var(--muted)]">
                  {tk("case_radiologist_findings_paste")}
                </label>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {tk("case_radiologist_findings_paste_hint")}
                </p>
                <textarea
                  id="batch-case-rad-findings"
                  rows={6}
                  value={batchFindingsPaste}
                  onChange={(e) => setBatchFindingsPaste(e.target.value)}
                  placeholder={"study_id\tfinal_impressions\nasi-708cbd32-…\tThere is an indeterminate…"}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
                />
                {(batchFindingsPreview.matched.length > 0 ||
                  batchFindingsPreview.unmatchedStudyIds.length > 0 ||
                  (batchTargetRows.length > 0 && batchFindingsPaste.trim() !== "")) && (
                  <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
                    {batchFindingsPreview.matched.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {tk("case_radiologist_findings_preview_matched")} (
                          {batchFindingsPreview.matched.length})
                        </p>
                        <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">
                          {batchFindingsPreview.matched.slice(0, 12).map((row) => (
                            <li key={row.caseId}>
                              <span className="font-mono text-[var(--text)]">{row.caseId}</span>
                              <span className="text-[var(--muted)]">
                                {" "}
                                ←{" "}
                                {row.finding.length > 80
                                  ? `${row.finding.slice(0, 80)}…`
                                  : row.finding}
                              </span>
                            </li>
                          ))}
                          {batchFindingsPreview.matched.length > 12 ? (
                            <li>+{batchFindingsPreview.matched.length - 12} more</li>
                          ) : null}
                        </ul>
                      </div>
                    )}
                    {batchFindingsPreview.unmatchedStudyIds.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--warn)]">
                          {tk("case_radiologist_findings_preview_unmatched_ids")}
                        </p>
                        <p className="mt-1 text-[var(--muted)]">
                          {batchFindingsPreview.unmatchedStudyIds.slice(0, 8).join(", ")}
                          {batchFindingsPreview.unmatchedStudyIds.length > 8
                            ? ` (+${batchFindingsPreview.unmatchedStudyIds.length - 8})`
                            : ""}
                        </p>
                      </div>
                    )}
                    {batchFindingsPaste.trim() !== "" &&
                      batchFindingsPreview.unmatchedCaseIds.length > 0 && (
                        <div>
                          <p className="font-medium text-[var(--muted)]">
                            {tk("case_radiologist_findings_preview_missing_cases")}
                          </p>
                          <p className="mt-1 text-[var(--muted)]">
                            {batchFindingsPreview.unmatchedCaseIds.slice(0, 8).join(", ")}
                            {batchFindingsPreview.unmatchedCaseIds.length > 8
                              ? ` (+${batchFindingsPreview.unmatchedCaseIds.length - 8})`
                              : ""}
                          </p>
                        </div>
                      )}
                  </div>
                )}
              </div>
              <CaseDetailsFields
                lang={lang}
                idPrefix="batch-case"
                value={batchDetails}
                onChange={(patch) => {
                  if (
                    typeof patch.radiologistFinding === "string" &&
                    looksLikeRadiologistFindingsTable(patch.radiologistFinding)
                  ) {
                    setBatchFindingsPaste(patch.radiologistFinding);
                    setBatchDetails((prev) => ({
                      ...prev,
                      ...patch,
                      radiologistFinding: "",
                    }));
                    return;
                  }
                  setBatchDetails((prev) => ({ ...prev, ...patch }));
                }}
                guides={guides}
                topics={topics}
                scopeOptions={scopeOptions}
                projectOptions={projectOptions}
                rbProjectOptions={rbProjectOptions}
                required
                showBaseRatePlaceholder
                baseRateHint={tk("case_base_rate_hint")}
              />
              <CaseQualityBonusField
                lang={lang} idPrefix="batch-case" value={batchQualityBonus} required={false}
                placeholder={lang === "vi" ? "Giữ từng ca" : "Keep each case"}
                onChange={value => { setBatchQualityBonus(value); setBatchQualityChanged(true); }}
                hint={lang === "vi" ? "Tỷ lệ 5★ tính trên thù lao tối thiểu (gồm khẩn cấp, không gồm thêm giờ). Nhập tỷ lệ để áp dụng cho các ca đã chọn; 0% tắt thưởng. Để trống hoặc không sửa để giữ tỷ lệ riêng của từng ca. Không thay đổi khoản tiền đã duyệt." : "5★ percentage of minimum case pay (including urgency, excluding extra time). Enter a percentage to apply to selected cases; 0% disables the bonus. Leave blank or unchanged to preserve each case’s percentage. Already approved amounts are unaffected."}
              />
              <label className="md:col-span-2 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={batchUpdateTiming} onChange={event => { setBatchUpdateTiming(event.target.checked); setBatchTimingStart(Date.now()); }} />
                <span>{lang === "vi" ? "Đặt lại hạn chót và thời gian hết hạn" : "Set new deadlines and expiry times"}<span className="mt-1 block text-xs text-[var(--muted)]">{lang === "vi" ? "Bỏ chọn để giữ lịch hiện tại của từng ca." : "Leave unchecked to keep each case’s current schedule."}</span></span>
              </label>
              {batchUpdateTiming && <CaseTimingFields
                lang={lang} deadlineHours={batchDeadlineHours} expiryGraceHours={batchGraceHours}
                setDeadlineHours={value => { setBatchDeadlineHours(value); setBatchTimingStart(Date.now()); }}
                setExpiryGraceHours={value => { setBatchGraceHours(value); setBatchTimingStart(Date.now()); }}
                baseRate={batchDetails.compensationAmount} previewStart={batchTimingStart}
                urgencyHint={(() => {
                  const rates = batchTargetRows.map(row => rushPercentFromHours((batchTimingStart + batchDeadlineHours * 3600000 - new Date(row.createdAt).getTime()) / 3600000));
                  const low = rates.length ? Math.min(...rates) : 0;
                  const high = rates.length ? Math.max(...rates) : 0;
                  return `${lang === "vi" ? "Khẩn cấp theo ngày tạo gốc" : "Urgency from original issue date"}: ${low === high ? low : `${low}–${high}`}% (${lang === "vi" ? "nếu đủ điều kiện" : "if eligible"})`;
                })()}
              />}
              <details className="md:col-span-2 rounded-md border border-[var(--border)] p-3">
                <summary className="cursor-pointer text-sm">{lang === "vi" ? "Nâng cao: thay khoản điều chỉnh đã lưu" : "Advanced: replace saved review adjustment"}</summary>
                <label className="mt-2 block text-sm">
                  <span>{tk("case_annotatorBonus")}</span>
                  <input name="annotatorBonus" type="number" step="0.01" value={batchBonusAmount} onChange={event => setBatchBonusAmount(event.target.value)} placeholder={lang === "vi" ? "Giữ nguyên" : "Keep existing"} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" />
                  <span className="mt-1 block text-xs text-[var(--muted)]">{lang === "vi" ? "Đây là số tiền, không phải tỷ lệ 5★. Nhập giá trị sẽ thay khoản thưởng/trừ đã lưu, kể cả ca đã duyệt. Để trống để giữ nguyên." : "This is a monetary amount, not the 5★ percentage. Entering a value replaces saved bonuses or deductions, including approved payouts. Leave blank to keep them."}</span>
                </label>
              </details>
              <label className="md:col-span-2">
                <span className="text-sm text-[var(--muted)]">{tk("assign_email")}</span>
                <select
                  value={batchAssignment}
                  onChange={(e) => setBatchAssignment(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                >
                  <option value="KEEP">{tk("reviewer_batch_keep_assignment")}</option>
                  <option value="UNASSIGN">— {tk("unassigned")} —</option>
                  {annotators.map((annotator) => (
                    <option key={annotator.id} value={annotator.id}>
                      {annotator.name} ({annotator.email})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            </fieldset>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => { if (!pending) setBatchEditOpen(false); }}
              >
                {tk("drawer_close")}
              </button>
              <button
                type="submit"
                disabled={pending || batchTargetRows.length === 0}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {pending ? (lang === "vi" ? "Đang cập nhật…" : "Updating cases…") : `${tk("reviewer_batch_apply")} (${batchTargetRows.length})`}
              </button>
            </div>
          </form>
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
                  projectOptions={projectOptions}
                  rbProjectOptions={rbProjectOptions}
                  mentionOptions={detailMentionOptions}
                  referenceCases={detailReferenceCases}
                  scopeOfWorkTemplate={templateByScope.get(detailCase.scopeOfWork.trim())?.template ?? null}
                  commentChoiceMode={
                    templateByScope.get(detailCase.scopeOfWork.trim())?.commentChoiceMode ?? "FREE"
                  }
                  commentChoicesText={
                    templateByScope.get(detailCase.scopeOfWork.trim())?.commentChoices ?? ""
                  }
                  commentFieldConfigs={
                    templateByScope.get(detailCase.scopeOfWork.trim())?.commentFieldConfigs ?? "[]"
                  }
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
                      <table className="w-full min-w-[880px] text-left text-sm">
                        <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_annotator")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_projects")}</th>
                            <th className="px-3 py-2 font-medium">{tk("reviewer_perf_total")}</th>
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
                                                  rushPercent: c.rushPercent,
                                                  rushForfeitReason: c.rushForfeitReason,
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
                                                {(c.status === CaseStatus.AVAILABLE ||
                                                  c.status === CaseStatus.ASSIGNED ||
                                                  c.status === CaseStatus.REJECTED) &&
                                                  !c.isReference && (
                                                  <button
                                                    type="button"
                                                    className="rounded border border-[var(--muted)]/50 bg-[var(--bg)] px-1.5 py-0.5 text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                                                    onClick={() => adminCompleteCase(c.id)}
                                                  >
                                                    {tk("reviewer_admin_complete")}
                                                  </button>
                                                )}
                                                {c.status === CaseStatus.SUBMITTED && (
                                                  <>
                                                    <button
                                                      type="button"
                                                      className="rounded border border-[var(--success)]/50 bg-[var(--success)]/15 px-1.5 py-0.5 text-[var(--success)] hover:bg-[var(--success)]/25"
                                                      onClick={() => {
                                                        setErr(null);
                                                        setAuditBonusOverridden(false);
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
                                                        setAuditBonusOverridden(false);
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
              cases.find((x) => x.id === audit.caseId)?.wasResubmitted && (
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
                setAuditBonusOverridden(false);
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
                        caseRushPercent(auditCase),
                      ),
                      { wasResubmitted: auditCase.wasResubmitted, fiveStarBonusPercent: auditCase.fiveStarBonusPercent },
                    ),
                  ),
                );
              }}
              required
            />
            {audit.decision === "ACCEPT" && auditQualityRating != null && (
              <label className="mb-2 block">
                <span className="text-sm text-[var(--muted)]">{tk("case_quality_adjustment")}</span>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("review_quality_adjustment_hint")} {lang === "vi" ? "Thưởng 5★ của ca" : "Case 5★ bonus"}: {cases.find(c => c.id === audit.caseId)?.fiveStarBonusPercent ?? 15}%.</p>
                <input
                  type="number"
                  step="0.01"
                  value={auditAnnotatorBonus}
                  onChange={(e) => { setAuditAnnotatorBonus(e.target.value); setAuditBonusOverridden(e.target.value.trim() !== ""); }}
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
