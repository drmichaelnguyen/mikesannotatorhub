"use client";

import { useEffect, useMemo, useState } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import {
  effectiveCommentChoiceMode,
  joinMultiCommentChoices,
  type CommentChoiceMode,
} from "@/lib/comment-choices";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { MentionOption } from "@/lib/guide-topic";

const OTHER = "__other__";

/**
 * Comment body input: free text, single dropdown choice, or multi-select choices.
 * Always stores the composed text via `onChange` (same as a plain textarea).
 */
export function CommentChoiceInput({
  lang,
  mode,
  choices,
  value,
  onChange,
  onPaste,
  mentionOptions = [],
  rows = 4,
  placeholder,
  autoFocus = false,
  textareaKey,
}: {
  lang: Lang;
  mode: CommentChoiceMode;
  choices: string[];
  value: string;
  onChange: (value: string) => void;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  mentionOptions?: MentionOption[];
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  /** Remount when template row / case changes so local select state resets. */
  textareaKey?: string | number;
}) {
  const tk = (k: DictKey) => t(lang, k);
  const effective = effectiveCommentChoiceMode(mode, choices);
  const choiceSet = useMemo(() => new Set(choices), [choices]);

  const [dropdownSelect, setDropdownSelect] = useState(() => {
    if (effective !== "DROPDOWN") return "";
    if (value && choiceSet.has(value)) return value;
    if (value) return OTHER;
    return "";
  });
  const [multiSelected, setMultiSelected] = useState<string[]>(() => {
    if (effective !== "MULTI") return [];
    const lines = value.split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
    return lines.filter((line) => choiceSet.has(line));
  });
  const [multiExtra, setMultiExtra] = useState(() => {
    if (effective !== "MULTI") return "";
    const lines = value.split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
    return lines.filter((line) => !choiceSet.has(line)).join("\n");
  });

  // Sync local UI when parent resets value (e.g. template field change).
  useEffect(() => {
    if (effective === "DROPDOWN") {
      if (!value) {
        setDropdownSelect("");
      } else if (choiceSet.has(value)) {
        setDropdownSelect(value);
      } else {
        setDropdownSelect(OTHER);
      }
      return;
    }
    if (effective === "MULTI") {
      const lines = value.split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
      setMultiSelected(lines.filter((line) => choiceSet.has(line)));
      setMultiExtra(lines.filter((line) => !choiceSet.has(line)).join("\n"));
    }
  }, [value, effective, choiceSet, textareaKey]);

  if (effective === "FREE") {
    return (
      <MentionTextarea
        key={textareaKey}
        lang={lang}
        value={value}
        onChange={onChange}
        onPaste={onPaste}
        rows={rows}
        placeholder={placeholder ?? tk("review_comment")}
        mentionOptions={mentionOptions}
        autoFocus={autoFocus}
      />
    );
  }

  if (effective === "DROPDOWN") {
    const isOther = dropdownSelect === OTHER;
    return (
      <div className="space-y-2">
        <select
          value={dropdownSelect}
          onChange={(e) => {
            const next = e.target.value;
            setDropdownSelect(next);
            if (!next) {
              onChange("");
              return;
            }
            if (next === OTHER) {
              if (choiceSet.has(value)) onChange("");
              return;
            }
            onChange(next);
          }}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          aria-label={tk("discussion_comment_choices")}
        >
          <option value="">{tk("case_choose")}</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
          <option value={OTHER}>{tk("discussion_comment_write_own")}</option>
        </select>
        {isOther ? (
          <MentionTextarea
            key={`${textareaKey ?? "dd"}-other`}
            lang={lang}
            value={value}
            onChange={onChange}
            onPaste={onPaste}
            rows={rows}
            placeholder={placeholder ?? tk("review_comment")}
            mentionOptions={mentionOptions}
            autoFocus
          />
        ) : null}
        <p className="text-xs text-[var(--muted)]">{tk("discussion_comment_dropdown_hint")}</p>
      </div>
    );
  }

  // MULTI
  return (
    <div className="space-y-2">
      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        {choices.map((choice) => {
          const checked = multiSelected.includes(choice);
          return (
            <label key={choice} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...multiSelected, choice]
                    : multiSelected.filter((c) => c !== choice);
                  setMultiSelected(next);
                  onChange(joinMultiCommentChoices(next, multiExtra));
                }}
              />
              <span>{choice}</span>
            </label>
          );
        })}
      </div>
      <label className="block">
        <span className="text-xs text-[var(--muted)]">{tk("discussion_comment_extra")}</span>
        <MentionTextarea
          key={`${textareaKey ?? "multi"}-extra`}
          lang={lang}
          value={multiExtra}
          onChange={(next) => {
            setMultiExtra(next);
            onChange(joinMultiCommentChoices(multiSelected, next));
          }}
          onPaste={onPaste}
          rows={Math.max(2, rows - 1)}
          placeholder={tk("discussion_comment_extra_placeholder")}
          mentionOptions={mentionOptions}
        />
      </label>
      <p className="text-xs text-[var(--muted)]">{tk("discussion_comment_multi_hint")}</p>
    </div>
  );
}
