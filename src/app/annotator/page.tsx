import { redirect } from "next/navigation";
import { getLangFromCookies } from "@/app/actions/lang";
import { getAnnotatorBoard, getAnnotatorCompensationSummary } from "@/app/actions/cases";
import { getAnnotatorNotifications } from "@/app/actions/notifications";
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
  if (user.role !== "ANNOTATOR") redirect("/reviewer");
  const lang = await getLangFromCookies();
  const tk = (k: DictKey) => t(lang, k);

  let board;
  let summary;
  let notifGroups;
  try {
    [board, summary, notifGroups] = await Promise.all([
      getAnnotatorBoard(),
      getAnnotatorCompensationSummary(),
      getAnnotatorNotifications(),
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
        notificationSlot={<NotificationBell lang={lang} initialGroups={notifGroups} />}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{tk("annotator_title")}</h1>
          <p className="text-sm text-[var(--muted)]">{user.email}</p>
        </div>
        <AnnotatorStatsPanel lang={lang} summary={summary} />
        <section>
          <h2 className="mb-3 text-lg font-medium">{tk("dash_cases_heading")}</h2>
          <AnnotatorWorkboard
            lang={lang}
            available={board.available}
            mine={board.mine}
            rejected={board.rejected}
          />
        </section>
      </main>
    </div>
  );
}
