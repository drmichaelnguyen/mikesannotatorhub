export type AdvancedDataEntity = "cases" | "topics" | "guides" | "users" | "notes";

export type AdvancedDataTable = {
  entity: AdvancedDataEntity;
  columns: string[];
  rows: Record<string, string>[];
};

export type AdvancedDataBundle = Record<AdvancedDataEntity, AdvancedDataTable>;

export function cellDisplay(value: string, maxLen = 120): { text: string; title?: string } {
  if (value.length <= maxLen) return { text: value };
  return { text: `${value.slice(0, maxLen)}…`, title: value };
}

export function rowMatchesNeedle(row: Record<string, string>, needle: string): boolean {
  if (!needle) return true;
  const lower = needle.toLowerCase();
  return Object.values(row).some((v) => v.toLowerCase().includes(lower));
}

export function rowMatchesColumnFilters(
  row: Record<string, string>,
  filters: Record<string, string>,
): boolean {
  for (const [col, value] of Object.entries(filters)) {
    if (value && row[col] !== value) return false;
  }
  return true;
}

export function sortRows(
  rows: Record<string, string>[],
  column: string | null,
  direction: "asc" | "desc",
): Record<string, string>[] {
  if (!column) return rows;
  return [...rows].sort((a, b) => {
    const av = a[column] ?? "";
    const bv = b[column] ?? "";
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? cmp : -cmp;
  });
}

export function uniqueColumnValues(rows: Record<string, string>[], column: string): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row[column];
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function exportTableCsv(table: AdvancedDataTable, filename: string) {
  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [
    table.columns.map(escape).join(","),
    ...table.rows.map((row) => table.columns.map((col) => escape(row[col] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
