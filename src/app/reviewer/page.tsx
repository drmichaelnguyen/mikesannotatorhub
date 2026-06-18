import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import { getReviewerDashboardStats, listReviewerCaseFilterOptions } from "@/app/actions/cases";
import { NavBar } from "@/components/NavBar";
import { ReviewerDashboardStatsPanel } from "@/components/reviewer/ReviewerDashboardStatsPanel";
import { ReviewerAdminSections } from "@/components/reviewer/ReviewerAdminSections";
import { NotificationBell } from "@/components/NotificationBell";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { getNotifications } from "@/app/actions/notifications";
import {
  ReviewerWorkboardSection,
  ReviewerWorkboardSectionFallback,
} from "@/app/reviewer/ReviewerWorkboardSection";

export default async function ReviewerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "REVIEWER") redirect("/annotator");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let stats;
  let filterOptions;
  let notifGroups;
  try {
    [stats, filterOptions, notifGroups] = await Promise.all([
      getReviewerDashboardStats(),
      listReviewerCaseFilterOptions(),
      getNotifications(),
    ]);
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <NavBar
        lang={lang}
        role="REVIEWER"
        name={user.name}
        viewSwitch={{
          reviewerHref: "/reviewer",
          annotatorHref: "/annotator",
        }}
        notificationSlot={<NotificationBell lang={lang} initialGroups={notifGroups} />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("reviewer_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{tk("appName")}</p>
        </div>
        <ReviewerDashboardStatsPanel lang={lang} {...stats} />
        <Suspense fallback={<ReviewerWorkboardSectionFallback lang={lang} />}>
          <ReviewerWorkboardSection lang={lang} />
        </Suspense>
        <ReviewerAdminSections
          lang={lang}
          scopeOptions={filterOptions.scopeOptions}
          rbProjectOptions={filterOptions.rbProjectOptions}
        />
      </main>
    </div>
  );
}
