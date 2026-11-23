"use client";

import { LocaleContext } from "@/lib/client";
import type { Locale } from "@/lib/types";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
