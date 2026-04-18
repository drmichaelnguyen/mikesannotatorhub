"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markCaseNotificationsReadAction,
} from "@/app/actions/notifications";
import type { NotificationGroup } from "@/app/actions/notifications";
import { NOTIF } from "@/lib/notification-types";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function typeLabel(lang: Lang, type: string): string {
  const map: Record<string, DictKey> = {
    [NOTIF.NEW_CASE]: "notif_new_case",
    [NOTIF.CASE_ASSIGNED]: "notif_case_assigned",
    [NOTIF.NEW_COMMENT]: "notif_new_comment",
    [NOTIF.CASE_REJECTED]: "notif_case_rejected",
  };
  return t(lang, (map[type] ?? "notif_new_case") as DictKey);
}

function typeDot(type: string) {
  if (type === NOTIF.CASE_REJECTED) return "bg-[var(--danger)]";
  if (type === NOTIF.NEW_COMMENT) return "bg-blue-400";
  if (type === NOTIF.CASE_ASSIGNED) return "bg-[var(--accent)]";
  return "bg-[var(--success)]";
}

export function NotificationBell({
  lang,
  initialGroups,
}: {
  lang: Lang;
  initialGroups: NotificationGroup[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(initialGroups);
  const router = useRouter();
  const [, start] = useTransition();

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  function dismissCase(annotationCaseId: string) {
    setGroups((prev) => prev.filter((g) => g.annotationCaseId !== annotationCaseId));
    start(async () => {
      await markCaseNotificationsReadAction(annotationCaseId);
      router.refresh();
    });
  }

  function dismissAll() {
    setGroups([]);
    start(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:border-[var(--accent)]"
        aria-label={tk("notif_title")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="inline-block"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-bold leading-none text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-semibold">{tk("notif_title")}</span>
              {total > 0 && (
                <button
                  type="button"
                  className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={dismissAll}
                >
                  {tk("notif_mark_all")}
                </button>
              )}
            </div>
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--muted)]">{tk("notif_empty")}</p>
            ) : (
              <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto">
                {groups.map((g) => (
                  <div key={g.annotationCaseId} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-[var(--text)]">
                        {g.caseLabel}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                        onClick={() => dismissCase(g.annotationCaseId)}
                      >
                        {tk("notif_dismiss")}
                      </button>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {g.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeDot(item.type)}`} />
                          {typeLabel(lang, item.type)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
