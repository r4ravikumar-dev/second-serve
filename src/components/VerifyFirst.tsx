"use client";

import { useT } from "@/lib/client";

export function VerifyFirst({ href }: { href: string }) {
  const { t } = useT();
  return (
    <div className="alert alert-warning stack-sm">
      <span className="t-mobile-body-lg-regular">{t("verifyFirst")}</span>
      <a className="btn btn-primary t-mobile-label-xl-medium" href={href}>{t("verificationTitle")}</a>
    </div>
  );
}
