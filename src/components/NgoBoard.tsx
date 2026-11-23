"use client";

import { useEffect, useMemo, useState } from "react";
import { api, time, useT } from "@/lib/client";
import type { Donation } from "@/lib/types";
import { ErrorBox, Loading } from "./Badges";
import { OfferMap, type Pin } from "./OfferMap";

type D = Omit<Donation, "handoverCodeHash" | "handoverCodeEnc"> & { handoverCode?: string | null };
type Data = { ngo: { name: string; serviceArea: { lat: number; lng: number; radiusKm: number } }; open: D[]; mine: D[] };

export function NgoBoard() {
  const { t, locale } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [mapDown, setMapDown] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => api<Data>("/api/donations").then(setD).catch((e) => setError(e.message));
  useEffect(() => { load(); const id = setInterval(load, 20_000); return () => clearInterval(id); }, []);

  const claim = async (id: string) => {
    try { await api(`/api/donations/${id}`, { body: { action: "claim" } }); load(); } catch (e) { setError((e as Error).message); }
  };
  const pins: Pin[] = useMemo(() => (d?.open ?? []).map((x) => ({ id: x.id, lat: x.location.lat, lng: x.location.lng, label: t("meals", { n: x.estimatedMeals }), tone: "info" as const, title: x.merchantName })), [d, t]);
  if (!d) return error ? <ErrorBox message={error} /> : <Loading />;

  const card = (x: D) => (
    <div key={x.id} className="card stack-sm">
      <div className="row-between"><span className="t-mobile-heading-md">{x.merchantName}</span><span className="badge badge-info t-mobile-label-md-medium">{t("meals", { n: x.estimatedMeals })}</span></div>
      <span className="t-mobile-body-lg-regular">{x.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</span>
      <span className="muted t-mobile-body-sm-regular">{t("pickup")} {time(x.pickupWindow.start, locale)}–{time(x.pickupWindow.end, locale)} · {t("allergens")}: {x.safetyAttestation.allergens.join(", ") || t("none")}</span>
      {x.status === "offered" && <button type="button" className="btn btn-primary t-mobile-label-xl-medium" onClick={() => claim(x.id)}>{t("claim")}</button>}
      {x.status === "claimed" && x.handoverCode && (
        <div className="alert alert-info stack-sm" style={{ alignItems: "center" }}>
          <span className="t-mobile-body-sm-regular">{t("yourHandoverCode")}</span>
          <span className="big-code t-mobile-display-md">{x.handoverCode}</span>
        </div>
      )}
      {x.status === "collected" && <span className="badge badge-solid-success t-mobile-label-md-medium">{t("collected")}</span>}
    </div>
  );

  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("donationsTitle")}</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === "list"} className="t-mobile-label-xl-medium" onClick={() => setView("list")}>{t("list")}</button>
          <button role="tab" aria-selected={view === "map"} className="t-mobile-label-xl-medium" onClick={() => { setView("map"); setMapDown(false); }}>{t("map")}</button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {view === "map" && !mapDown ? (
        <div style={{ position: "relative" }}>
          <OfferMap center={d.ngo.serviceArea} pins={pins} selectedId={selected} onSelect={setSelected} onUnavailable={() => setMapDown(true)} />
          {selected && d.open.find((x) => x.id === selected) && <div className="sheet">{card(d.open.find((x) => x.id === selected)!)}</div>}
        </div>
      ) : (
        <>
          {view === "map" && mapDown && <div className="alert alert-neutral t-mobile-body-sm-regular">{t("mapBusy")}</div>}
          {d.open.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("noDonations")}</p> : d.open.map(card)}
        </>
      )}
      {d.mine.length > 0 && <><h2 className="t-mobile-heading-lg section-title">{t("navReservations")}</h2>{d.mine.map(card)}</>}
    </div>
  );
}
