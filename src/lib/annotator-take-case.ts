import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export type TakeCaseBlockReason = "pending_review_ack" | "active_case";

export function resolveTakeCaseBlockReason(input: {
  pendingReviewAckCount: number;
  hasUnsubmittedCase: boolean;
}): TakeCaseBlockReason | null {
  if (input.pendingReviewAckCount > 0) return "pending_review_ack";
  if (input.hasUnsubmittedCase) return "active_case";
  return null;
}

export function formatAnnotatorTakeBlockMessage(
  lang: Lang,
  reason: TakeCaseBlockReason,
  activeCaseId?: string | null,
): string {
  const tk = (k: DictKey) => t(lang, k);
  if (reason === "pending_review_ack") return tk("annotator_review_ack_block_take");
  if (activeCaseId) {
    return tk("annotator_active_case_block_take_named").replace("{caseId}", activeCaseId);
  }
  return tk("annotator_active_case_block_take");
}

export function formatAnnotatorTakeBlockError(
  lang: Lang,
  error: string,
  activeCaseId?: string | null,
): string {
  const tk = (k: DictKey) => t(lang, k);
  if (error === "pending_review_ack") return tk("annotator_review_ack_block_take");
  if (error === "active_case") {
    return activeCaseId
      ? tk("annotator_active_case_block_take_named").replace("{caseId}", activeCaseId)
      : tk("annotator_active_case_block_take");
  }
  return tk("reviewer_assign_taken");
}
