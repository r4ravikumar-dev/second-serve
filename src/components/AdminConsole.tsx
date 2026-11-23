"use client";

import { useEffect, useMemo, useState } from "react";
import { api, DEMO_CENTER, inr, useT } from "@/lib/client";
import type { PublicOffer, Verification } from "@/lib/types";
import { ErrorBox, Loading } from "./Badges";
import { Checks } from "./Onboarding";
import { OfferMap, type Pin } from "./OfferMap";

type Q = { kind: "merchant" | "ngo"; id: string; name: string; verification: Verification };
type MapData = { merchants: { id: string; name: string; location: { lat: number; lng: number }; status: string }[]; offers: PublicOffer[]; donations: { id: string; merchantName: string; location: { lat: number; lng: number }; estimatedMeals: number }[] };

export function AdminConsole() {
  const { t } = useT();
  const [queue, setQueue] = useState<Q[] | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapDown, setMapDown] = useState(false);
  const load = () => {
    api<Q[]>("/api/admin/verification").then(setQueue).catch((e) => setError(e.message));
    api<MapData>("/api/admin/map").then(setMap).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const decide = async (q: Q, approve: boolean) => {
    const reason = approve ? undefined : prompt(t("rejectReason")) ?? undefined;
    if (!approve && !reason) return;
    try { await api("/api/admin/verification", { body: { kind: q.kind, id: q.id, approve, reason } }); load(); } catch (e) { setError((e as Error).message); }
  };

  const pins: Pin[] = useMemo(() => !map ? [] : [
    ...map.merchants.map((m) => ({ id: m.id, lat: m.location.lat, lng: m.location.lng, label: m.name.split(" ")[0], tone: (m.status === "verified" ? "success" : m.status === "suspended" ? "error" : "warning") as Pin["tone"], title: `${m.name} (${m.status})` })),
    ...map.offers.map((o) => ({ id: o.id, lat: o.location.lat + 0.0008, lng: o.location.lng + 0.0008, label: inr(o.price), title: o.title })),
    ...map.donations.map((d) => ({ id: d.id, lat: d.location.lat - 0.0008, lng: d.location.lng - 0.0008, label: t("meals", { n: d.estimatedMeals }), tone: "info" as const, title: d.merchantName })),
  ], [map, t]);

  return (
    <div className="stack-lg">
      <div className="stack">
        <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("adminTitle")}</h1>
        {error && <ErrorBox message={error} />}
        {!queue ? <Loading /> : queue.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("nothingToReview")}</p> : queue.map((q) => (
          <div key={`${q.kind}_${q.id}`} className="card stack-sm">
            <div className="row-between"><span className="t-mobile-heading-md">{q.name}</span><span className="badge badge-warning t-mobile-label-md-medium">{q.kind}</span></div>
            <span className="t-mobile-body-sm-regular">{q.verification.documentType} · <strong>{q.verification.licenceNumber}</strong> · {q.verification.licenceName}{q.verification.validUpto ? ` · ${q.verification.validUpto}` : ""}</span>
            {q.verification.checks && <Checks checks={q.verification.checks} />}
            <span className="muted t-mobile-body-xs-regular">{t("extractedBy", { m: q.verification.extractedBy ?? "?" })}</span>
            {q.kind === "merchant" && <a className="t-mobile-label-lg-medium" href="https://foscos.fssai.gov.in/" target="_blank" rel="noopener noreferrer">{t("officialLookup")} ↗</a>}
            <div className="row">
              <button type="button" className="btn btn-primary t-mobile-label-xl-medium" onClick={() => decide(q, true)}>{t("approve")}</button>
              <button type="button" className="btn btn-danger t-mobile-label-xl-medium" onClick={() => decide(q, false)}>{t("reject")}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="stack">
        <h2 className="t-mobile-heading-lg section-title">{t("areaMap")}</h2>
        {mapDown ? <div className="alert alert-neutral t-mobile-body-sm-regular">{t("mapBusy")}</div>
          : map && <OfferMap center={map.merchants[0]?.location ?? DEMO_CENTER} pins={pins} onUnavailable={() => setMapDown(true)} />}
      </div>
    </div>
  );
}
