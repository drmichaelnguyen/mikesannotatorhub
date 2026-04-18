"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createAnnotatorAccountAction, type CreateAnnotatorResult } from "@/app/actions/users";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

function errMsg(lang: Lang, e: NonNullable<Extract<CreateAnnotatorResult, { ok: false }>["error"]>) {
  const tk = (k: DictKey) => t(lang, k);
  switch (e) {
    case "password_short":
      return tk("error_password_short");
    case "email_invalid":
      return tk("error_email_invalid");
    case "email_taken":
      return tk("error_email_taken");
    case "forbidden":
      return tk("required");
    default:
      return tk("required");
  }
}

export function CreateAnnotatorForm({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_: CreateAnnotatorResult | null, fd: FormData) => createAnnotatorAccountAction(fd),
    null as CreateAnnotatorResult | null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="grid max-w-xl gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2"
    >
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("email")}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("annotator_name")}</span>
        <input
          name="name"
          required
          autoComplete="name"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="md:col-span-2">
        <span className="text-sm text-[var(--muted)]">{tk("annotator_password")}</span>
        <p className="text-xs text-[var(--muted)]">{tk("annotator_password_hint")}</p>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      {state && !state.ok && (
        <p className="md:col-span-2 text-sm text-[var(--danger)]">{errMsg(lang, state.error)}</p>
      )}
      {state?.ok && (
        <p className="md:col-span-2 text-sm text-[var(--success)]">{tk("annotator_created")}</p>
      )}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {tk("create_annotator_submit")}
        </button>
      </div>
    </form>
  );
}
