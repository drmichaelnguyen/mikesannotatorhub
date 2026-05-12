import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import {
  getAnnotatorBoard,
  getAnnotatorAvailabilitySummary,
  getAnnotatorCompensationSummary,
  listGuidesAndTopics,
} from "@/app/actions/cases";
import { AnnotatorAvailabilityPanel } from "@/components/AnnotatorAvailabilityPanel";
import { getNotifications } from "@/app/actions/notifications";
import { AnnotatorStatsPanel } from "@/components/AnnotatorStatsPanel";
import { AnnotatorWorkboard } from "@/components/annotator/AnnotatorWorkboard";
import { NavBar } from "@/components/NavBar";
import { NotificationBell } from "@/components/NotificationBell";
import { getCurrentUser } from "@/lib/auth";
import type { DictKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export default async function AnnotatorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ANNOTATOR" && user.role !== "REVIEWER") redirect("/login");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let board;
  let summary;
  let availability;
  let guidesAndTopics;
  let notifGroups;
  try {
    [board, summary, availability, guidesAndTopics, notifGroups] = await Promise.all([
      getAnnotatorBoard(),
      getAnnotatorCompensationSummary(),
      getAnnotatorAvailabilitySummary(),
      listGuidesAndTopics(),
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
        <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <summary className="cursor-pointer select-none px-4 py-3 hover:bg-[var(--bg)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold">{tk("annotator_title")}</h1>
                <p className="text-sm text-[var(--muted)]">{user.email}</p>
              </div>
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                Expand
              </span>
            </div>
          </summary>
          <div className="space-y-8 border-t border-[var(--border)] p-4">
            <AnnotatorStatsPanel lang={lang} summary={summary} />
            <AnnotatorAvailabilityPanel lang={lang} summary={availability} />
          </div>
        </details>
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("dash_cases_heading")}</h2>
          <AnnotatorWorkboard
            lang={lang}
            available={board.available}
            mine={board.mine}
            rejected={board.rejected}
            reference={board.reference}
            guides={guidesAndTopics.guides}
            topics={guidesAndTopics.topics}
          />
        </section>
      </main>
    </div>
  );
}
