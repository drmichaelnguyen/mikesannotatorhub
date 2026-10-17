"use client";

import { useState, type ReactNode } from "react";

export type CaseDetailTab = {
  id: string;
  label: string;
  badge?: string;
  content: ReactNode;
};

export function initialCaseDetailTab(hasFinding: boolean): string {
  return hasFinding ? "finding" : "discussion";
}

export function CaseDetailTabs({
  caseDbId,
  tabs,
  defaultTab,
}: {
  caseDbId: string;
  tabs: CaseDetailTab[];
  defaultTab: string;
}) {
  const resolvedDefault = tabs.some((tab) => tab.id === defaultTab) ? defaultTab : tabs[0]?.id ?? "";
  const [active, setActive] = useState(resolvedDefault);
  const [visited, setVisited] = useState<Set<string>>(() => new Set(resolvedDefault ? [resolvedDefault] : []));

  if (tabs.length === 0) return null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-1">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`case-tab-${caseDbId}-${tab.id}`}
              aria-selected={selected}
              aria-controls={`case-panel-${caseDbId}-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActive(tab.id);
                setVisited((prev) => {
                  if (prev.has(tab.id)) return prev;
                  const next = new Set(prev);
                  next.add(tab.id);
                  return next;
                });
              }}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                selected
                  ? "border-[var(--accent)] font-medium text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
              {tab.badge ? (
                <span className="ml-1.5 tabular-nums text-xs font-normal text-[var(--muted)]">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) =>
        visited.has(tab.id) ? (
          <div
            key={tab.id}
            role="tabpanel"
            id={`case-panel-${caseDbId}-${tab.id}`}
            aria-labelledby={`case-tab-${caseDbId}-${tab.id}`}
            hidden={active !== tab.id}
            className="p-3"
          >
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
