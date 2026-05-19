"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { safeNextPath } from "@/lib/safe-next-path";
import type { DictKey, Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type LoginState =
  | null
  | { ok: true; role: "REVIEWER" | "ANNOTATOR" }
  | { ok: false; error: "login" | "required" };

const fieldClass =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2";

export function LoginForm({ lang, next }: { lang: Lang; next?: string }) {
  const tk = (k: DictKey) => t(lang, k);
  const router = useRouter();
  /** Real inputs mount only on the client so password-manager extensions (e.g. Keeper) cannot mutate SSR HTML before hydration. */
  const [inputsReady, setInputsReady] = useState(false);
  const [state, formAction, pending] = useActionState(async (_: LoginState, fd: FormData) => {
    return loginAction(fd);
  }, null);

  useEffect(() => {
    setInputsReady(true);
  }, []);

  useEffect(() => {
    if (state?.ok) {
      const n = safeNextPath(next);
      if (n) {
        router.push(n);
        return;
      }
      router.push(state.role === "REVIEWER" ? "/reviewer" : "/annotator");
    }
  }, [state, router, next]);

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <h1 className="text-xl font-semibold">{tk("login")}</h1>
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("email")}</span>
        {inputsReady ? (
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className={fieldClass}
          />
        ) : (
          <div
            aria-hidden
            className={`${fieldClass} block h-[42px] animate-pulse bg-[var(--border)]/30`}
          />
        )}
      </label>
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{tk("password")}</span>
        {inputsReady ? (
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={fieldClass}
          />
        ) : (
          <div
            aria-hidden
            className={`${fieldClass} block h-[42px] animate-pulse bg-[var(--border)]/30`}
          />
        )}
      </label>
      {state && !state.ok && (
        <p className="text-sm text-[var(--danger)]">
          {state.error === "required" ? tk("required") : tk("login_error")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !inputsReady}
        className="w-full rounded-md bg-[var(--accent)] py-2 text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {tk("signIn")}
      </button>
      <p className="text-xs text-[var(--muted)]">{tk("login_demo_hint")}</p>
    </form>
  );
}
