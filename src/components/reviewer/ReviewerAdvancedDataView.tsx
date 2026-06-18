"use client";

import { useMemo, useState } from "react";
import type { AdvancedDataBundle, AdvancedDataEntity } from "@/lib/advanced-data-view";
import {
  cellDisplay,
  exportTableCsv,
  rowMatchesColumnFilters,
  rowMatchesNeedle,
  sortRows,
  uniqueColumnValues,
} from "@/lib/advanced-data-view";
import { useDebouncedSearchNeedle } from "@/lib/use-debounced-search-needle";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const ENTITY_KEYS: AdvancedDataEntity[] = ["cases", "topics", "guides", "users", "notes"];

const FILTER_COLUMNS: Partial<Record<AdvancedDataEntity, string[]>> = {
  cases: ["status", "redbrickProject", "isReference"],
  users: ["role"],
  notes: ["isQuestion"],
};

const ENTITY_LABEL: Record<AdvancedDataEntity, DictKey> = {
  cases: "reviewer_advanced_entity_cases",
  topics: "reviewer_advanced_entity_topics",
  guides: "reviewer_advanced_entity_guides",
  users: "reviewer_advanced_entity_users",
  notes: "reviewer_advanced_entity_notes",
};

export function ReviewerAdvancedDataView({
  lang,
  data,
}: {
  lang: Lang;
  data: AdvancedDataBundle;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [entity, setEntity] = useState<AdvancedDataEntity>("cases");
  const [search, setSearch] = useState("");
  const needle = useDebouncedSearchNeedle(search, 300);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const table = data[entity];
  const filterCols = FILTER_COLUMNS[entity] ?? [];

  const filteredRows = useMemo(() => {
    let rows = table.rows.filter(
      (row) => rowMatchesNeedle(row, needle) && rowMatchesColumnFilters(row, columnFilters),
    );
    rows = sortRows(rows, sortColumn, sortDir);
    return rows;
  }, [table.rows, needle, columnFilters, sortColumn, sortDir]);

  function toggleSort(col: string) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(col);
    setSortDir("asc");
  }

  function onEntityChange(next: AdvancedDataEntity) {
    setEntity(next);
    setColumnFilters({});
    setSortColumn(null);
    setSortDir("asc");
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--muted)]">{tk("reviewer_advanced_hint")}</p>

      <div className="flex flex-wrap gap-2">
        {ENTITY_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onEntityChange(key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              entity === key
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            {tk(ENTITY_LABEL[key])}
            <span className="ml-1.5 tabular-nums text-[var(--muted)]">({data[key].rows.length})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="text-[var(--muted)]">{tk("reviewer_advanced_search")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tk("reviewer_advanced_search_ph")}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>
        {filterCols.map((col) => {
          const options = uniqueColumnValues(table.rows, col);
          if (options.length === 0) return null;
          return (
            <label key={col} className="block text-sm">
              <span className="text-[var(--muted)]">{col}</span>
              <select
                value={columnFilters[col] ?? ""}
                onChange={(e) =>
                  setColumnFilters((prev) => {
                    const next = { ...prev };
                    if (e.target.value) next[col] = e.target.value;
                    else delete next[col];
                    return next;
                  })
                }
                className="mt-1 block rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm"
              >
                <option value="">{tk("reviewer_advanced_filter_all")}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <button
          type="button"
          onClick={() => exportTableCsv({ ...table, rows: filteredRows }, `${entity}-export.csv`)}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
        >
          {tk("reviewer_advanced_export_csv")}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)]">
        {tk("reviewer_advanced_row_count")
          .replace("{shown}", String(filteredRows.length))
          .replace("{total}", String(table.rows.length))}
      </p>

      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              {table.columns.map((col) => (
                <th key={col} className="whitespace-nowrap border-b border-[var(--border)] px-2 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(col)}
                    className="hover:text-[var(--text)]"
                  >
                    {col}
                    {sortColumn === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={table.columns.length} className="px-3 py-6 text-center text-[var(--muted)]">
                  {tk("no_cases")}
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => (
                <tr key={`${row.id ?? i}-${i}`} className="border-b border-[var(--border)]/60 hover:bg-[var(--surface)]/50">
                  {table.columns.map((col) => {
                    const raw = row[col] ?? "";
                    const { text, title } = cellDisplay(raw);
                    return (
                      <td
                        key={col}
                        title={title}
                        className="max-w-[16rem] truncate whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-[var(--text)]"
                      >
                        {text || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
