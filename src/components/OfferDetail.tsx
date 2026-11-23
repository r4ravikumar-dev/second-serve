"use client";

import { useEffect, useState } from "react";
import { api, inr, time, useT } from "@/lib/client";
import type { PublicOffer } from "@/lib/types";
import { CategoryChip, ErrorBox, Loading, OfferBadge, VegMark } from "./Badges";
import { Qr } from "./Qr";

export function OfferDetail({ id }: { id: string }) {
  const { t, locale } = useT();
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; qr: string } | null>(null);

  useEffect(() => { api<PublicOffer>(`/api/offers/${id}`).then(setOffer).catch((e) => setError(e.message)); }, [id]);

  const reserve = async () => {
    setBusy(true); setError(null);
    try { setDone(await api<{ code: string; qr: string }>("/api/reservations", { body: { offerId: id, qty } })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (error && !offer) return <ErrorBox message={error} />;
  if (!offer) return <Loading />;
  const title = locale === "hi" && offer.titleHi ? offer.titleHi : offer.title;

  if (done) return (
    <div className="card stack" style={{ alignItems: "center", textAlign: "center" }}>
      <span className="badge badge-live t-mobile-label-md-medium">{t("reserved")}</span>
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("yourCode")}</h1>
      <div className="big-code t-mobile-display-lg">{done.code}</div>
      <Qr value={done.qr} />
      <p className="muted t-mobile-body-lg-regular">{t("showCode")} {t("payAtPickup")}</p>
      <p className="t-mobile-heading-md">{t("total")}: {inr(offer.price * qty)}</p>
      <a className="btn btn-secondary t-mobile-label-xl-medium" href="/me">{t("navReservations")}</a>
    </div>
  );

  return (
    <div className="stack">
      <a href="/offers" className="t-mobile-label-lg-medium">← {t("back")}</a>
      <div className="card stack">
        <div className="row-between">
          <div className="row"><VegMark mark={offer.vegMark} /><h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{title}</h1></div>
          <OfferBadge qty={offer.qtyAvailable} pickupEnd={offer.pickupEnd} />
        </div>
        <span className="muted t-mobile-body-lg-regular">{offer.merchantName}</span>
        <div className="row">
          <span className="t-mobile-display-md">{inr(offer.price)}</span>
          <span className="strike t-mobile-body-lg-regular">{inr(offer.originalPrice)}</span>
          <CategoryChip category={offer.category} />
        </div>
        <div className="t-mobile-body-lg-regular">{t("pickup")}: {time(offer.pickupStart, locale)}–{time(offer.pickupEnd, locale)} · {t("left", { n: offer.qtyAvailable })}</div>
        <div className="alert alert-warning t-mobile-body-sm-regular"><strong>{t("allergens")}:</strong> {offer.allergens.length ? offer.allergens.join(", ") : t("none")}</div>
        <a className="t-mobile-label-lg-medium" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${offer.location.lat},${offer.location.lng}`}>{t("openInMaps")} ↗</a>
        <div className="divider" />
        <div className="row-between">
          <div className="row">
            <button type="button" className="btn btn-round t-mobile-heading-md" aria-label="−" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="t-mobile-heading-lg" aria-live="polite">{qty}</span>
            <button type="button" className="btn btn-round t-mobile-heading-md" aria-label="+" onClick={() => setQty((q) => Math.min(3, offer.qtyAvailable, q + 1))}>+</button>
          </div>
          <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={busy || offer.qtyAvailable < 1} onClick={reserve}>
            {t("reserveQty", { n: qty })} · {inr(offer.price * qty)}
          </button>
        </div>
        <p className="muted t-mobile-body-sm-regular">{t("payAtPickup")}</p>
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}
