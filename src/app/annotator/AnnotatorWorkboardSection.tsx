import dynamic from "next/dynamic";
import {
  getAnnotatorBoard,
  getAnnotatorPendingReviewAcknowledgments,
  listGuidesAndTopicsLite,
} from "@/app/actions/cases";
import { SectionLoadingPlaceholder } from "@/components/LoadingProgressBar";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const AnnotatorWorkboard = dynamic(
  () => import("@/components/annotator/AnnotatorWorkboard").then((m) => m.AnnotatorWorkboard),
  {
    loading: () => <SectionLoadingPlaceholder />,
  },
);

export async function AnnotatorWorkboardSection({ lang }: { lang: Lang }) {
  const [board, guidesAndTopics, pendingReviewAcks] = await Promise.all([
    getAnnotatorBoard(),
    listGuidesAndTopicsLite(),
    getAnnotatorPendingReviewAcknowledgments(),
  ]);

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">{t(lang, "dash_cases_heading")}</h2>
      <AnnotatorWorkboard
        lang={lang}
        available={board.available}
        mine={board.mine}
        rejected={board.rejected}
        reference={board.reference}
        guides={guidesAndTopics.guides}
        topics={guidesAndTopics.topics}
        pendingReviewAcks={pendingReviewAcks}
      />
    </section>
  );
}

export function AnnotatorWorkboardSectionFallback({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  return <SectionLoadingPlaceholder label={tk("ui_loading")} />;
}
