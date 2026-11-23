"use client";

import { categoryKey } from "@/lib/i18n";
import { useT } from "@/lib/client";
import type { Category, VegMark as VM } from "@/lib/types";

export function CategoryChip({ category }: { category: Category }) {
  const { t } = useT();
  return <span className={`badge chip-${category} t-mobile-label-md-medium`}>{t(categoryKey(category))}</span>;
}

export function VegMark({ mark }: { mark: VM }) {
  const { t } = useT();
  const label = mark === "veg" ? t("veg") : mark === "egg" ? t("egg") : t("nonveg");
  return <span className={`vegmark ${mark}`} role="img" aria-label={label} title={label} />;
}

export function OfferBadge({ qty, pickupEnd }: { qty: number; pickupEnd: number }) {
  const { t } = useT();
  if (qty <= 0) return <span className="badge badge-neutral t-mobile-label-md-medium">{t("soldOut")}</span>;
  if (pickupEnd - Date.now() < 30 * 60_000) return <span className="badge badge-warning t-mobile-label-md-medium">{t("endingSoon")}</span>;
  if (qty <= 2) return <span className="badge badge-brand t-mobile-label-md-medium">{t("fewLeft")}</span>;
  return <span className="badge badge-live t-mobile-label-md-medium">{t("live")}</span>;
}

export function Loading() {
  const { t } = useT();
  return <p className="muted t-mobile-body-lg-regular" role="status">{t("loading")}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="alert alert-error t-mobile-body-sm-regular" role="alert">{message}</div>;
}
