import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import {
  listAnnotatorsForAssignment,
  listCasesForReviewer,
  listGuidesAndTopics,
} from "@/app/actions/cases";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CreateAnnotatorForm } from "@/components/CreateAnnotatorForm";
import { CreateCaseForm } from "@/components/CreateCaseForm";
import { GuideTopicManager } from "@/components/reviewer/GuideTopicManager";
import { NavBar } from "@/components/NavBar";
import { ReviewerWorkboard } from "@/components/reviewer/ReviewerWorkboard";
import { ReviewerDashboardStatsPanel } from "@/components/reviewer/ReviewerDashboardStatsPanel";
import { NotificationBell } from "@/components/NotificationBell";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { serializeReviewerCase } from "@/lib/reviewer-serialize";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";
import { getNotifications } from "@/app/actions/notifications";
import { CaseStatus } from "@prisma/client";

export default async function ReviewerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "REVIEWER") redirect("/annotator");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let cases: ReviewerCaseRow[];
  let annotators: Awaited<ReturnType<typeof listAnnotatorsForAssignment>>;
  let guidesAndTopics: Awaited<ReturnType<typeof listGuidesAndTopics>>;
  let notifGroups;
  try {
    [cases, annotators, guidesAndTopics, notifGroups] = await Promise.all([
      listCasesForReviewer() as Promise<ReviewerCaseRow[]>,
      listAnnotatorsForAssignment(),
      listGuidesAndTopics(),
      getNotifications(),
    ]);
  } catch {
    redirect("/login");
  }

  const serialized = cases.map(serializeReviewerCase);
  const caseDone = cases.filter((c) => c.completedAt != null).length;
  const caseSubmittedPendingReview = cases.filter((c) => c.status === CaseStatus.SUBMITTED).length;
  const caseApproved = cases.filter(
    (c) => c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED,
  ).length;
  const difficultyRatings = cases.filter((c) => c.difficultyRating != null);
  const qualityRatings = cases.filter((c) => c.qualityRating != null);
  const avg = (list: { difficultyRating?: number | null; qualityRating?: number | null }[], key: "difficultyRating" | "qualityRating") => {
    const vals = list.map((item) => item[key]).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((sum, v) => sum + v, 0) / vals.length) * 10) / 10;
  };

  return (
    <div className="min-h-screen">
      <NavBar
        lang={lang}
        role="REVIEWER"
        name={user.name}
        notificationSlot={<NotificationBell lang={lang} initialGroups={notifGroups} />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("reviewer_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{tk("appName")}</p>
        </div>
        <ReviewerDashboardStatsPanel
          lang={lang}
          totalAnnotators={annotators.length}
          caseDone={caseDone}
          caseSubmittedPendingReview={caseSubmittedPendingReview}
          caseApproved={caseApproved}
          averageDifficulty={avg(cases, "difficultyRating")}
          difficultyCount={difficultyRatings.length}
          averageQuality={avg(cases, "qualityRating")}
          qualityCount={qualityRatings.length}
        />
        <section>
          <CollapsibleSection title={tk("reviewer_guide_section")}>
            <GuideTopicManager lang={lang} guides={guidesAndTopics.guides} topics={guidesAndTopics.topics} />
          </CollapsibleSection>
        </section>
        <section>
          <CollapsibleSection title={tk("reviewer_create_annotator")}>
            <CreateAnnotatorForm lang={lang} />
          </CollapsibleSection>
        </section>
        <section>
          <CollapsibleSection title={tk("reviewer_create")}>
            <CreateCaseForm
              lang={lang}
              annotators={annotators}
              guides={guidesAndTopics.guides}
              topics={guidesAndTopics.topics}
            />
          </CollapsibleSection>
        </section>
        <section>
          <ReviewerWorkboard
            lang={lang}
            cases={serialized}
            annotators={annotators}
            guides={guidesAndTopics.guides}
            topics={guidesAndTopics.topics}
          />
        </section>
      </main>
    </div>
  );
}
