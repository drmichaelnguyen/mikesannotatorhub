import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import {
  getAnnotatorAvailabilitySummary,
  getAnnotatorCompensationSummary,
} from "@/app/actions/cases";
import { AnnotatorAvailabilityPanel } from "@/components/AnnotatorAvailabilityPanel";
import { getNotifications } from "@/app/actions/notifications";
import { AnnotatorStatsPanel } from "@/components/AnnotatorStatsPanel";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { NavBar } from "@/components/NavBar";
import { NotificationBell } from "@/components/NotificationBell";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import {
  AnnotatorWorkboardSection,
  AnnotatorWorkboardSectionFallback,
} from "@/app/annotator/AnnotatorWorkboardSection";

export default async function AnnotatorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ANNOTATOR" && user.role !== "REVIEWER") redirect("/login");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let summary;
  let availability;
  let notifGroups;
  try {
    [summary, availability, notifGroups] = await Promise.all([
      getAnnotatorCompensationSummary(),
      getAnnotatorAvailabilitySummary(),
      getNotifications(),
    ]);
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <NavBar
        lang={lang}
        role="ANNOTATOR"
        name={user.name}
        viewSwitch={
          user.role === "REVIEWER"
            ? {
                reviewerHref: "/reviewer",
                annotatorHref: "/annotator",
              }
            : undefined
        }
        notificationSlot={<NotificationBell lang={lang} initialGroups={notifGroups} />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("annotator_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{user.email}</p>
        </div>
        <CollapsibleSection title={`${tk("dash_compensation")} · ${tk("availability_title")}`}>
          <div className="space-y-8">
            <AnnotatorStatsPanel lang={lang} summary={summary} />
            <AnnotatorAvailabilityPanel lang={lang} summary={availability} />
          </div>
        </CollapsibleSection>
        <Suspense fallback={<AnnotatorWorkboardSectionFallback lang={lang} />}>
          <AnnotatorWorkboardSection lang={lang} />
        </Suspense>
      </main>
    </div>
  );
}
