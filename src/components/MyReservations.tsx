"use client";

import { useEffect, useState } from "react";
import { api, inr, time, useT } from "@/lib/client";
import type { Reservation } from "@/lib/types";
import { ErrorBox, Loading } from "./Badges";
import { Qr } from "./Qr";

type Row = Omit<Reservation, "codeHash" | "codeEnc"> & { code: string | null; qr: string | null };

export function MyReservations() {
  const { t, locale } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<Row[]>("/api/reservations").then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const cancel = async (id: string) => {
    if (!confirm(t("cancelReservation") + "?")) return;
    try { await api(`/api/reservations/${id}`, { method: "DELETE" }); load(); } catch (e) { setError((e as Error).message); }
  };

  const badge = (s: Row["status"]) => ({
    reserved: <span className="badge badge-brand t-mobile-label-md-medium">{t("reserved")}</span>,
    collected: <span className="badge badge-solid-success t-mobile-label-md-medium">{t("collected")}</span>,
    cancelled: <span className="badge badge-error t-mobile-label-md-medium">{t("cancelled")}</span>,
    no_show: <span className="badge badge-error t-mobile-label-md-medium">{t("noShow")}</span>,
  })[s];

  return (
    <div className="stack">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("navReservations")}</h1>
      {error && <ErrorBox message={error} />}
      {!rows ? <Loading /> : rows.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("noReservations")}</p> : rows.map((r) => (
        <div key={r.id} className="card stack-sm">
          <div className="row-between"><span className="t-mobile-heading-md">{r.offerTitle}</span>{badge(r.status)}</div>
          <span className="muted t-mobile-body-sm-regular">{r.merchantName} · {t("pickup")} {time(r.pickupStart, locale)}–{time(r.pickupEnd, locale)} · {r.qty} × {inr(r.priceEach)}</span>
          {r.status === "reserved" && r.code && r.qr && (
            <div className="stack-sm" style={{ alignItems: "center" }}>
              <span className="big-code t-mobile-display-md">{r.code}</span>
              <Qr value={r.qr} />
              <span className="muted t-mobile-body-sm-regular">{t("showCode")} {t("payAtPickup")}</span>
              <button type="button" className="btn btn-danger btn-sm t-mobile-label-lg-medium" onClick={() => cancel(r.id)}>{t("cancel")}</button>
            </div>
          )}
        </div>
      ))}
      <a className="t-mobile-label-lg-medium" href="/onboard">{t("onboardTitle")} / {t("ngoOnboardTitle")} →</a>
    </div>
  );
}
