"use client";

import { useId, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export function FileUploadButton({
  id,
  label,
  accept,
  multiple = false,
  directory = false,
  name,
  className,
  lang,
  onFiles,
  onInputChange,
}: {
  id?: string;
  label: string;
  accept?: string;
  multiple?: boolean;
  /** Enable folder picker (Chrome / Edge). */
  directory?: boolean;
  name?: string;
  className?: string;
  lang?: Lang;
  onFiles?: (files: File[]) => void;
  onInputChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [summary, setSummary] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  return (
    <div className={className ?? "mt-2 flex flex-wrap items-center gap-2"}>
      <input
        id={inputId}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple || directory}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          setCount(files.length);
          if (files.length === 0) {
            setSummary(null);
          } else if (files.length === 1 && !directory) {
            setSummary(files[0]!.name);
          } else {
            setSummary(null);
          }
          onFiles?.(files);
          onInputChange?.(event);
        }}
        {...(directory
          ? ({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)
          : {})}
      />
      <label
        htmlFor={inputId}
        className="inline-flex cursor-pointer items-center rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-medium text-[var(--text)] shadow-sm hover:border-[var(--accent)] hover:bg-[var(--surface)]"
      >
        {label}
      </label>
      {count > 0 && (
        <span className="text-xs text-[var(--muted)]">
          {summary ??
            (lang
              ? t(lang, "upload_files_selected").replace("{count}", String(count))
              : `${count}`)}
        </span>
      )}
    </div>
  );
}
