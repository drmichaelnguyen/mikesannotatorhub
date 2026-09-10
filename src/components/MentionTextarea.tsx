"use client";

import { useRef, useState } from "react";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";

export function MentionTextarea({
  lang,
  value,
  onChange,
  onPaste,
  rows,
  placeholder,
  mentionOptions,
  autoFocus = false,
}: {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  rows: number;
  placeholder?: string;
  mentionOptions: MentionOption[];
  autoFocus?: boolean;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [queryState, setQueryState] = useState<{ open: boolean; start: number; query: string }>({
    open: false,
    start: -1,
    query: "",
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const matches = queryState.open
    ? mentionOptions.filter((opt) => opt.label.toLowerCase().includes(queryState.query.toLowerCase()))
    : [];

  function updateQuery(nextValue: string, cursor = textareaRef.current?.selectionStart ?? nextValue.length) {
    const before = nextValue.slice(0, cursor);
    const match = before.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      setQueryState({ open: false, start: -1, query: "" });
      setActiveIndex(0);
      return;
    }
    const query = match[2] ?? "";
    setQueryState({ open: true, start: cursor - query.length - 1, query });
    setActiveIndex(0);
  }

  function insertMention(opt: MentionOption) {
    if (!queryState.open) return;
    const current = value;
    const cursor = textareaRef.current?.selectionStart ?? current.length;
    const start = queryState.start >= 0 ? queryState.start : cursor;
    const next = `${current.slice(0, start)}@${opt.label} ${current.slice(cursor)}`;
    onChange(next);
    setQueryState({ open: false, start: -1, query: "" });
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const nextPos = start + opt.label.length + 2;
      el.focus();
      el.setSelectionRange(nextPos, nextPos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => e.stopPropagation()}
        onKeyUpCapture={(e) => e.stopPropagation()}
        onKeyUp={(e) =>
          updateQuery(
            (e.target as HTMLTextAreaElement).value,
            e.currentTarget.selectionStart ?? e.currentTarget.value.length,
          )
        }
        onKeyDown={(e) => {
          if (!queryState.open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(matches[activeIndex]);
          } else if (e.key === "Escape") {
            setQueryState({ open: false, start: -1, query: "" });
          }
        }}
        onPaste={onPaste}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      />
      {queryState.open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">{tk("reviewer_mention_no_results")}</div>
          ) : (
            <ul role="listbox" className="max-h-56 overflow-auto py-1 text-sm">
              {matches.map((opt, index) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left ${
                      index === activeIndex ? "bg-[var(--bg)]" : "hover:bg-[var(--bg)]/70"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(opt);
                    }}
                  >
                    <span>{opt.label}</span>
                    <span className="text-xs text-[var(--muted)]">{opt.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-[var(--border)] px-3 py-1 text-[10px] text-[var(--muted)]">
            {tk("reviewer_mention_hint")}
          </div>
        </div>
      )}
    </div>
  );
}
