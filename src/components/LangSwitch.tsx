"use client";

import { useRouter } from "next/navigation";
import { setLang } from "@/app/actions/lang";
import type { Lang } from "@/lib/i18n";
import { dict } from "@/lib/i18n";

export function LangSwitch({ current }: { current: Lang }) {
  const router = useRouter();

  async function onChange(lang: Lang) {
    await setLang(lang);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`rounded-md px-2 py-1 ${current === "en" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
      >
        {dict.en.lang_en}
      </button>
      <button
        type="button"
        onClick={() => onChange("vi")}
        className={`rounded-md px-2 py-1 ${current === "vi" ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
      >
        {dict.vi.lang_vi}
      </button>
    </div>
  );
}
