"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { loginAction } from "@/app/actions/auth";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type LoginState =
  | null
  | { ok: true; role: "REVIEWER" | "ANNOTATOR" }
  | { ok: false; error: "login" | "required" };

export function LoginForm({ lang }: { lang: Lang }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (_: LoginState, fd: FormData) => {
    return loginAction(fd);
  }, null);

  useEffect(() => {
    if (state?.ok) {
      router.push(state.role === "REVIEWER" ? "/reviewer" : "/annotator");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <h1 className="text-xl font-semibold">{tk("login")}</h1>
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("email")}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("password")}</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        />
      </label>
      {state && !state.ok && (
        <p className="text-sm text-[var(--danger)]">
          {state.error === "required" ? tk("required") : tk("login_error")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--accent)] py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {tk("signIn")}
      </button>
      <p className="text-xs text-[var(--muted)]">
        Demo: reviewer@example.com / annotator@example.com — password demo123
      </p>
    </form>
  );
}
