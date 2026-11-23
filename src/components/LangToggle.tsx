"use client";

import { useRouter } from "next/navigation";
import { api, useT } from "@/lib/client";

export function LangToggle() {
  const { locale, t } = useT();
  const router = useRouter();
  const set = async (l: "en" | "hi") => {
    if (l === locale) return;
    await api("/api/locale", { body: { locale: l } });
    router.refresh();
  };
  return (
    <div className="segmented" role="group" aria-label={t("language")}>
      <button type="button" className="t-mobile-label-md-medium" aria-pressed={locale === "en"} onClick={() => set("en")}>EN</button>
      <button type="button" className="t-mobile-label-md-medium" aria-pressed={locale === "hi"} onClick={() => set("hi")} lang="hi">हिं</button>
    </div>
  );
}
