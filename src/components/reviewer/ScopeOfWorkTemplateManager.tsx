"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deleteScopeOfWorkTemplateAction,
  upsertScopeOfWorkTemplateAction,
  type ScopeOfWorkTemplateRow,
} from "@/app/actions/cases";
import {
  emptyFieldCommentConfig,
  expandFieldCommentConfigs,
  parseCommentChoiceMode,
  serializeFieldCommentConfigs,
  splitTemplateRows,
  type CommentChoiceMode,
  type FieldCommentConfig,
} from "@/lib/comment-choices";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function wordsCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

type TemplateFieldDraft = {
  label: string;
  mode: CommentChoiceMode;
  choicesText: string;
  mandatory: boolean;
  requireImage: boolean;
};

function draftsFromRow(row: ScopeOfWorkTemplateRow): TemplateFieldDraft[] {
  const labels = splitTemplateRows(row.template);
  const configs = expandFieldCommentConfigs(
    row.template,
    row.commentFieldConfigs,
    row.commentChoiceMode,
    row.commentChoices,
    row.requireImagePerEntry,
  );
  if (labels.length === 0) {
    return [{ label: "", mode: "FREE", choicesText: "", mandatory: true, requireImage: false }];
  }
  return labels.map((label, index) => {
    const cfg = configs[index] ?? emptyFieldCommentConfig();
    return {
      label,
      mode: cfg.mode,
      choicesText: cfg.choices.join("\n"),
      mandatory: cfg.mandatory,
      requireImage: cfg.requireImage,
    };
  });
}

function modeLabel(lang: Lang, mode: CommentChoiceMode): string {
  if (mode === "DROPDOWN") return t(lang, "reviewer_scope_comment_mode_dropdown");
  if (mode === "MULTI") return t(lang, "reviewer_scope_comment_mode_multi");
  return t(lang, "reviewer_scope_comment_mode_free");
}

export function ScopeOfWorkTemplateManager({
  lang,
  templates,
  scopeOptions = [],
}: {
  lang: Lang;
  templates: ScopeOfWorkTemplateRow[];
  scopeOptions?: string[];
}) {
  const tk = (k: DictKey) => t(lang, k);
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [fields, setFields] = useState<TemplateFieldDraft[]>([
    { label: "", mode: "FREE", choicesText: "", mandatory: true, requireImage: false },
  ]);
  const [upsertState, upsertAction, upsertPending] = useActionState(
    async (_: Awaited<ReturnType<typeof upsertScopeOfWorkTemplateAction>> | null, fd: FormData) => {
      return upsertScopeOfWorkTemplateAction(fd);
    },
    null as Awaited<ReturnType<typeof upsertScopeOfWorkTemplateAction>> | null,
  );

  useEffect(() => {
    if (upsertState?.ok) window.location.reload();
  }, [upsertState]);

  const allScopes = Array.from(new Set([...scopeOptions, ...templates.map((t) => t.scopeOfWork)])).sort((a, b) =>
    a.localeCompare(b),
  );

  const [localErr, setLocalErr] = useState<string | null>(null);
  useEffect(() => {
    if (!scopeOfWork) {
      setLocalErr(null);
      return;
    }
    if (wordsCount(scopeOfWork) > 12) setLocalErr(t(lang, "scope_word_limit"));
    else setLocalErr(null);
  }, [scopeOfWork, lang]);

  const templateValue = useMemo(
    () =>
      fields
        .map((f) => f.label.trim())
        .filter(Boolean)
        .join("\n"),
    [fields],
  );

  const commentFieldConfigsValue = useMemo(() => {
    const configs: FieldCommentConfig[] = fields
      .filter((f) => f.label.trim())
      .map((f) => {
        const mode = parseCommentChoiceMode(f.mode);
        const choices =
          mode === "FREE"
            ? []
            : f.choicesText
                .split(/\r?\n/g)
                .map((line) => line.trim())
                .filter(Boolean);
        return {
          mode,
          choices,
          mandatory: f.mandatory,
          requireImage: f.requireImage,
        };
      });
    return serializeFieldCommentConfigs(configs);
  }, [fields]);

  const requireImagePerEntry = useMemo(
    () => fields.some((f) => f.label.trim() && f.requireImage),
    [fields],
  );

  function loadRow(row: ScopeOfWorkTemplateRow) {
    setScopeOfWork(row.scopeOfWork);
    setFields(draftsFromRow(row));
  }

  function updateField(index: number, patch: Partial<TemplateFieldDraft>) {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { label: "", mode: "FREE", choicesText: "", mandatory: true, requireImage: false },
    ]);
  }

  function removeField(index: number) {
    setFields((prev) => {
      if (prev.length <= 1) {
        return [{ label: "", mode: "FREE", choicesText: "", mandatory: true, requireImage: false }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-lg font-medium">{tk("reviewer_scope_template_section")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tk("reviewer_scope_template_hint")}</p>
      </div>

      <form action={upsertAction} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
        <h3 className="text-sm font-medium">{tk("reviewer_scope_template_save")}</h3>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">{tk("reviewer_scope_template_scopeOfWork")}</span>
          <input
            list="scope-options-templates"
            name="scopeOfWork"
            required
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
          <datalist id="scope-options-templates">
            {allScopes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <input type="hidden" name="template" value={templateValue} />
        <input type="hidden" name="commentFieldConfigs" value={commentFieldConfigsValue} />
        {requireImagePerEntry ? <input type="hidden" name="requireImagePerEntry" value="on" /> : null}

        <div className="space-y-3">
          <div>
            <p className="text-sm text-[var(--muted)]">{tk("reviewer_scope_template_template")}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tk("reviewer_scope_comment_choices_hint")}</p>
          </div>

          {fields.map((field, index) => (
            <fieldset
              key={index}
              className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <legend className="px-1 text-sm font-medium text-[var(--text)]">
                {tk("reviewer_scope_template_field")} {index + 1}
              </legend>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">{tk("reviewer_scope_template_field_label")}</span>
                <input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  required={index === 0 || fields.length === 1}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder={tk("reviewer_scope_template_field_label_ph")}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">{tk("reviewer_scope_comment_choice_mode")}</span>
                <select
                  value={field.mode}
                  onChange={(e) =>
                    updateField(index, {
                      mode: parseCommentChoiceMode(e.target.value),
                      choicesText:
                        parseCommentChoiceMode(e.target.value) === "FREE" ? "" : field.choicesText,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                >
                  <option value="FREE">{tk("reviewer_scope_comment_mode_free")}</option>
                  <option value="DROPDOWN">{tk("reviewer_scope_comment_mode_dropdown")}</option>
                  <option value="MULTI">{tk("reviewer_scope_comment_mode_multi")}</option>
                </select>
              </label>
              {(field.mode === "DROPDOWN" || field.mode === "MULTI") && (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">{tk("reviewer_scope_comment_choices_list")}</span>
                  <textarea
                    required
                    rows={4}
                    value={field.choicesText}
                    onChange={(e) => updateField(index, { choicesText: e.target.value })}
                    placeholder={tk("reviewer_scope_comment_choices_placeholder")}
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {tk("reviewer_scope_comment_choices_list_hint")}
                  </span>
                </label>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.mandatory}
                    onChange={(e) => updateField(index, { mandatory: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[var(--text)]">
                      {tk("reviewer_scope_template_field_mandatory")}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {tk("reviewer_scope_template_field_mandatory_hint")}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.requireImage}
                    onChange={(e) => updateField(index, { requireImage: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[var(--text)]">
                      {tk("reviewer_scope_template_field_require_image")}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {tk("reviewer_scope_template_field_require_image_hint")}
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--danger)] hover:text-[var(--danger)]"
                >
                  {tk("reviewer_scope_template_remove_field")}
                </button>
              </div>
            </fieldset>
          ))}

          <button
            type="button"
            onClick={addField}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
          >
            {tk("reviewer_scope_template_add_field")}
          </button>
        </div>

        {localErr && <p className="text-sm text-[var(--danger)]">{localErr}</p>}
        {upsertState && !upsertState.ok && !localErr && (
          <p className="text-sm text-[var(--danger)]">
            {"error" in upsertState && upsertState.error === "scope_words" ? tk("scope_word_limit") : tk("required")}
          </p>
        )}

        <button
          type="submit"
          disabled={upsertPending || !!localErr || !templateValue}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_scope_template_save")}
        </button>
      </form>

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{tk("reviewer_scope_template_no_templates")}</p>
        ) : (
          templates.map((row) => {
            const labels = splitTemplateRows(row.template);
            const configs = expandFieldCommentConfigs(
              row.template,
              row.commentFieldConfigs,
              row.commentChoiceMode,
              row.commentChoices,
              row.requireImagePerEntry,
            );
            const anyImagesRequired = configs.some((cfg) => cfg.requireImage);
            return (
              <div key={row.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer select-none text-sm font-medium hover:text-[var(--accent)]">
                      {row.scopeOfWork}
                      {anyImagesRequired && (
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                          ({tk("reviewer_scope_template_require_images_badge")})
                        </span>
                      )}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        ({labels.length} {tk("reviewer_scope_template_fields_count")})
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {labels.map((label, index) => {
                        const cfg = configs[index] ?? emptyFieldCommentConfig();
                        return (
                          <div
                            key={`${row.id}-${index}`}
                            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
                          >
                            <p className="font-medium text-[var(--text)]">{label}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">{modeLabel(lang, cfg.mode)}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {cfg.mandatory
                                ? tk("reviewer_scope_template_field_mandatory_badge")
                                : tk("reviewer_scope_template_field_optional_badge")}
                              {cfg.requireImage
                                ? ` · ${tk("reviewer_scope_template_field_image_badge")}`
                                : ""}
                            </p>
                            {cfg.choices.length > 0 ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">
                                {cfg.choices.join("\n")}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                      onClick={() => loadRow(row)}
                    >
                      {tk("edit")}
                    </button>
                    <form
                      action={async (fd) => {
                        await deleteScopeOfWorkTemplateAction(fd);
                      }}
                      onSubmit={(e) => {
                        if (!window.confirm(tk("delete_confirm"))) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="scopeOfWork" value={row.scopeOfWork} />
                      <button
                        type="submit"
                        className="rounded-md border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
                      >
                        {tk("delete")}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
