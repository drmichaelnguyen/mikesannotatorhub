"use server";

import { cookies } from "next/headers";
import type { Lang } from "@/lib/i18n";

const COOKIE = "am_lang";

export async function setLang(lang: Lang) {
  (await cookies()).set(COOKIE, lang, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function getLangFromCookies(): Promise<Lang> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v === "vi" ? "vi" : "en";
}
