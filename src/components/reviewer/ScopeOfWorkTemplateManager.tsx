"use client";

import { useActionState, useEffect, useState } from "react";
import {
  deleteScopeOfWorkTemplateAction,
  upsertScopeOfWorkTemplateAction,
  type ScopeOfWorkTemplateRow,
} from "@/app/actions/cases";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function wordsCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
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
  const [template, setTemplate] = useState("");
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
    // Keep the UX snappy; server action enforces the real rule.
    if (wordsCount(scopeOfWork) > 12) setLocalErr(t(lang, "scope_word_limit"));
    else setLocalErr(null);
  }, [scopeOfWork, lang]);

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

        <label className="block text-sm">
          <span className="text-[var(--muted)]">{tk("reviewer_scope_template_template")}</span>
          <textarea
            name="template"
            required
            rows={10}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          />
        </label>

        {localErr && <p className="text-sm text-[var(--danger)]">{localErr}</p>}
        {upsertState && !upsertState.ok && !localErr && (
          <p className="text-sm text-[var(--danger)]">
            {"error" in upsertState && upsertState.error === "scope_words" ? tk("scope_word_limit") : tk("required")}
          </p>
        )}

        <button
          type="submit"
          disabled={upsertPending || !!localErr}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("reviewer_scope_template_save")}
        </button>
      </form>

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{tk("reviewer_scope_template_no_templates")}</p>
        ) : (
          templates.map((row) => (
            <div key={row.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer select-none text-sm font-medium hover:text-[var(--accent)]">
                    {row.scopeOfWork}
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
                    {row.template}
                  </div>
                </details>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                    onClick={() => {
                      setScopeOfWork(row.scopeOfWork);
                      setTemplate(row.template);
                    }}
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
          ))
        )}
      </div>
    </section>
  );
}

