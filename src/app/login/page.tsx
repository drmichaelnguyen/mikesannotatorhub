import Link from "next/link";
import { getLangFromCookies } from "@/app/actions/lang";
import { LangSwitch } from "@/components/LangSwitch";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "REVIEWER" ? "/reviewer" : "/annotator");
  const lang = await getLangFromCookies();

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto mb-6 flex max-w-md justify-end">
        <LangSwitch current={lang} />
      </div>
      <LoginForm lang={lang} />
      <p className="mx-auto mt-6 max-w-md text-center text-xs text-[var(--muted)]">
        <Link href="/" className="underline hover:text-[var(--text)]">
          {t(lang, "appName")}
        </Link>
      </p>
    </div>
  );
}
