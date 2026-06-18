import dynamic from "next/dynamic";
import {
  getAnnotatorCapacityRows,
  listAnnotatorsForAssignment,
  listCasesForReviewer,
  listGuidesAndTopicsLite,
  listScopeOfWorkTemplatesAction,
} from "@/app/actions/cases";
import { SectionLoadingPlaceholder } from "@/components/LoadingProgressBar";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { serializeReviewerCase } from "@/lib/reviewer-serialize";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";

const ReviewerWorkboard = dynamic(
  () => import("@/components/reviewer/ReviewerWorkboard").then((m) => m.ReviewerWorkboard),
  {
    loading: () => <SectionLoadingPlaceholder />,
  },
);

export async function ReviewerWorkboardSection({ lang }: { lang: Lang }) {
  const [cases, annotators, capacityRows, guidesAndTopics, templates] = await Promise.all([
    listCasesForReviewer() as Promise<ReviewerCaseRow[]>,
    listAnnotatorsForAssignment(),
    getAnnotatorCapacityRows(),
    listGuidesAndTopicsLite(),
    listScopeOfWorkTemplatesAction(),
  ]);

  const serialized = cases.map(serializeReviewerCase);

  return (
    <section id="reviewer-workboard">
      <ReviewerWorkboard
        lang={lang}
        cases={serialized}
        annotators={annotators}
        capacityRows={capacityRows}
        guides={guidesAndTopics.guides}
        topics={guidesAndTopics.topics}
        scopeTemplates={templates.map((item) => ({
          scopeOfWork: item.scopeOfWork,
          template: item.template,
        }))}
      />
    </section>
  );
}

export function ReviewerWorkboardSectionFallback({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  return <SectionLoadingPlaceholder label={tk("ui_loading")} />;
}
