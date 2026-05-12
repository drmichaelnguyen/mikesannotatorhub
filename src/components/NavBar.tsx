import type React from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { LangSwitch } from "@/components/LangSwitch";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function NavBar({
  lang,
  role,
  name,
  notificationSlot,
  viewSwitch,
}: {
  lang: Lang;
  role: "REVIEWER" | "ANNOTATOR";
  name: string;
  notificationSlot?: React.ReactNode;
  viewSwitch?: { reviewerHref?: string; annotatorHref?: string };
}) {
  const home = role === "REVIEWER" ? "/reviewer" : "/annotator";
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href={home} className="font-semibold text-[var(--text)]">
            {t(lang, "appName")}
          </Link>
          <nav className="flex gap-3 text-sm text-[var(--muted)]">
            <Link href={home} className="hover:text-[var(--text)]">
              {t(lang, "nav_dashboard")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {viewSwitch?.reviewerHref && viewSwitch?.annotatorHref && (
            <div className="inline-flex items-center overflow-hidden rounded-md border border-[var(--border)]">
              <Link
                href={viewSwitch.reviewerHref}
                className={`px-2 py-1 ${
                  role === "REVIEWER"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                }`}
              >
                {t(lang, "role_reviewer")}
              </Link>
              <Link
                href={viewSwitch.annotatorHref}
                className={`px-2 py-1 ${
                  role === "ANNOTATOR"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                }`}
              >
                {t(lang, "role_annotator")}
              </Link>
            </div>
          )}
          {notificationSlot}
          <span className="text-[var(--muted)]">{name}</span>
          <LangSwitch current={lang} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:border-[var(--accent)]"
            >
              {t(lang, "nav_logout")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
