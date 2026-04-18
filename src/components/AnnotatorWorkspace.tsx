"use client";

import { useState } from "react";
import type { AnnotationCase, CaseNote, Review, User } from "@prisma/client";
import { AnnotatorCaseCard } from "@/components/AnnotatorCaseCard";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Row = AnnotationCase & {
  reviews?: Review[];
  caseNotes?: (CaseNote & { author: Pick<User, "id" | "name" | "role"> })[];
};

export function AnnotatorWorkspace({
  lang,
  available,
  mine,
  rejected,
}: {
  lang: Lang;
  available: Row[];
  mine: Row[];
  rejected: Row[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [tab, setTab] = useState<"available" | "mine" | "rejected">("available");

  const tabs: { id: typeof tab; label: DictKey }[] = [
    { id: "available", label: "tab_available" },
    { id: "mine", label: "tab_mine" },
    { id: "rejected", label: "tab_rejected" },
  ];

  const list =
    tab === "available" ? available : tab === "mine" ? mine : rejected;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === x.id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {tk(x.label)}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-[var(--muted)]">{tk("no_cases")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((row) => (
            <AnnotatorCaseCard
              key={row.id}
              lang={lang}
              row={row}
              mode={tab}
              canPost={tab !== "available"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
