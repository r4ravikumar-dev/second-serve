"use client";

import { useMemo, useState } from "react";
import { DEMO_CENTER, distanceKm, inr, time, useT } from "@/lib/client";
import type { PublicOffer } from "@/lib/types";
import { CategoryChip, ErrorBox, Loading, OfferBadge, VegMark } from "./Badges";
import { OfferMap, type Pin } from "./OfferMap";
import { useLiveOffers, useLocation } from "./useLiveOffers";

export function LiveOffers() {
  const { t, locale } = useT();
  const { pos, isFallback } = useLocation(DEMO_CENTER);
  const { offers, error } = useLiveOffers(pos);
  const [view, setView] = useState<"list" | "map">("list");
  const [mapDown, setMapDown] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const pins: Pin[] = useMemo(() => (offers ?? []).map((o) => ({
    id: o.id, lat: o.location.lat, lng: o.location.lng, label: inr(o.price),
    tone: o.pickupEnd - Date.now() < 30 * 60_000 ? "warning" : "brand", title: o.title,
  })), [offers]);
  const sel = offers?.find((o) => o.id === selected);

  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("nearYou")}</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === "list"} className="t-mobile-label-xl-medium" onClick={() => setView("list")}>{t("list")}</button>
          <button role="tab" aria-selected={view === "map"} className="t-mobile-label-xl-medium" onClick={() => { setView("map"); setMapDown(false); }}>{t("map")}</button>
        </div>
      </div>
      {isFallback && <div className="alert alert-neutral t-mobile-body-sm-regular">{t("usingDemoLocation")}</div>}
      {error && <ErrorBox message={error} />}
      {!offers ? <Loading /> : view === "map" && !mapDown ? (
        <div style={{ position: "relative" }}>
          <OfferMap center={pos!} pins={pins} selectedId={selected} onSelect={setSelected} onUnavailable={() => setMapDown(true)} />
          {sel && <div className="sheet"><OfferCard offer={sel} center={pos!} /></div>}
        </div>
      ) : (
        <>
          {view === "map" && mapDown && <div className="alert alert-neutral t-mobile-body-sm-regular">{t("mapBusy")}</div>}
          {offers.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("noOffers")}</p>
            : offers.map((o) => <OfferCard key={o.id} offer={o} center={pos!} />)}
        </>
      )}
      <p className="muted t-mobile-body-xs-regular">{locale === "hi" ? "हर बदलाव लाइव दिखता है।" : "Updates live as stock changes."}</p>
    </div>
  );
}

export function OfferCard({ offer, center }: { offer: PublicOffer; center: { lat: number; lng: number } }) {
  const { t, locale } = useT();
  const title = locale === "hi" && offer.titleHi ? offer.titleHi : offer.title;
  return (
    <a href={`/offers/${offer.id}`} className="card interactive offer-card" style={{ color: "inherit" }}>
      <div className="row-between">
        <div className="row"><VegMark mark={offer.vegMark} /><span className="t-mobile-heading-md">{title}</span></div>
        <OfferBadge qty={offer.qtyAvailable} pickupEnd={offer.pickupEnd} />
      </div>
      <div className="row muted t-mobile-body-sm-regular">
        <span>{offer.merchantName}</span>·<span>{t("kmAway", { d: distanceKm(center, offer.location).toFixed(1) })}</span>
      </div>
      <div className="row-between">
        <div className="row">
          <span className="price t-mobile-heading-lg">{inr(offer.price)}</span>
          <span className="strike t-mobile-body-sm-regular">{inr(offer.originalPrice)}</span>
          <CategoryChip category={offer.category} />
        </div>
        <span className="muted t-mobile-body-sm-regular">{t("pickup")} {time(offer.pickupStart, locale)}–{time(offer.pickupEnd, locale)} · {t("left", { n: offer.qtyAvailable })}</span>
      </div>
    </a>
  );
}
