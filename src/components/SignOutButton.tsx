"use client";

import { api, useT } from "@/lib/client";

export function SignOutButton({ name }: { name: string }) {
  const { t } = useT();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm t-mobile-label-lg-medium"
      title={name}
      onClick={async () => { await api("/api/session", { method: "DELETE" }); window.location.href = "/"; }}
    >
      {t("signOut")}
    </button>
  );
}
