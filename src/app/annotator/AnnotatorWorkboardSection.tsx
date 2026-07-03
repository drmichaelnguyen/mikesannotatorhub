import dynamic from "next/dynamic";
import {
  getAnnotatorBoard,
  getAnnotatorPendingReviewAcknowledgments,
  listGuidesAndTopicsLite,
} from "@/app/actions/cases";
import { getAnnotatorRedbrickFlags } from "@/app/actions/redbrick-flags";
import { resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { getCurrentUser } from "@/lib/auth";
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
  const user = await getCurrentUser();
  const workspaceUserId = user ? await resolveAnnotatorWorkspaceUserId(user) : null;
  const [board, guidesAndTopics, pendingReviewAcks, redbrickFlags] = await Promise.all([
    getAnnotatorBoard(),
    listGuidesAndTopicsLite(),
    getAnnotatorPendingReviewAcknowledgments(),
    getAnnotatorRedbrickFlags(),
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
        currentUserId={workspaceUserId}
        redbrickFlags={redbrickFlags}
      />
    </section>
  );
}

export function AnnotatorWorkboardSectionFallback({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  return <SectionLoadingPlaceholder label={tk("ui_loading")} />;
}
