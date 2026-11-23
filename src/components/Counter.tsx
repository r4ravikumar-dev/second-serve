"use client";

import { useEffect, useRef, useState } from "react";
import { api, inr, time, useT } from "@/lib/client";
import type { Donation, Offer } from "@/lib/types";
import { ErrorBox } from "./Badges";

export function Counter() {
  const { t, locale } = useT();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ offerTitle: string; qty: number; amountDue: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const load = () => {
    api<Offer[]>("/api/offers?mine=1").then((o) => setOffers(o.filter((x) => x.status === "live" || x.status === "sold_out"))).catch(() => undefined);
    api<{ mine: Donation[] }>("/api/donations").then((r) => setDonations(r.mine.filter((d) => d.status === "offered" || d.status === "claimed"))).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const verify = async (body: object) => {
    setError(null); setResult(null);
    try { setResult(await api("/api/pickups", { body })); setCode(""); load(); }
    catch (e) { setError((e as Error).message); }
  };

  // QR scanning where the browser supports BarcodeDetector; typing the code always works.
  const scan = async () => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) { setError("QR scanning isn't supported in this browser — type the code."); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
    catch { setError("Camera permission denied — type the code instead."); return; }
    setScanning(true);
    if (video.current) { video.current.srcObject = stream; await video.current.play(); }
    const det = new BD({ formats: ["qr_code"] });
    const stop = () => { stream.getTracks().forEach((tr) => tr.stop()); setScanning(false); };
    const tick = async () => {
      if (!video.current) return stop();
      const found = await det.detect(video.current).catch(() => []);
      if (found[0]) { stop(); verify({ qr: found[0].rawValue }); } else setTimeout(tick, 300);
    };
    tick();
    setTimeout(stop, 30_000);
  };

  const withdraw = async (id: string) => {
    if (!confirm(t("withdraw") + "?")) return;
    try { await api(`/api/offers/${id}`, { method: "DELETE" }); load(); } catch (e) { setError((e as Error).message); }
  };

  const handover = async (id: string) => {
    const c = prompt(t("ngoCode"));
    if (!c) return;
    try { await api(`/api/donations/${id}`, { body: { action: "handover", code: c } }); load(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="stack">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("counterTitle")}</h1>
      <div className="card stack">
        <label className="field t-mobile-label-lg-medium"><span>{t("enterCode")}</span>
          <input className="code-input t-mobile-display-md" maxLength={6} value={code} autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
        </label>
        <div className="row">
          <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={code.length !== 6} onClick={() => verify({ code })}>{t("verify")}</button>
          <button type="button" className="btn btn-secondary t-mobile-label-xl-medium" onClick={scan}>{t("scanQr")}</button>
        </div>
        {scanning && <video ref={video} playsInline muted style={{ width: "100%", borderRadius: "var(--radius-12)" }} />}
        {result && <div className="alert alert-success-solid t-mobile-heading-md" role="status">{t("verified", { amount: result.amountDue })} · {result.qty} × {result.offerTitle}</div>}
        {error && <ErrorBox message={error} />}
      </div>

      <h2 className="t-mobile-heading-lg section-title">{t("myOffers")}</h2>
      {offers.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("nothingYet")}</p> : offers.map((o) => (
        <div key={o.id} className="card card-tight row-between">
          <div className="stack-sm">
            <span className="t-mobile-heading-sm">{o.title}</span>
            <span className="muted t-mobile-body-sm-regular">{inr(o.price)} · {t("left", { n: o.qtyAvailable })}/{o.qtyTotal} · {time(o.pickupStart, locale)}–{time(o.pickupEnd, locale)}</span>
          </div>
          <button type="button" className="btn btn-danger btn-sm t-mobile-label-lg-medium" onClick={() => withdraw(o.id)}>{t("withdraw")}</button>
        </div>
      ))}

      <h2 className="t-mobile-heading-lg section-title">{t("navDonations")}</h2>
      {donations.length === 0 ? <p className="muted t-mobile-body-lg-regular">{t("nothingYet")}</p> : donations.map((d) => (
        <div key={d.id} className="card card-tight row-between">
          <div className="stack-sm">
            <span className="t-mobile-heading-sm">{d.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</span>
            <span className={`badge ${d.status === "claimed" ? "badge-info" : "badge-neutral"} t-mobile-label-md-medium`}>{d.status === "claimed" ? `${t("claimed")} · ${d.claimedByName}` : t("live")}</span>
          </div>
          {d.status === "claimed" && <button type="button" className="btn btn-primary btn-sm t-mobile-label-lg-medium" onClick={() => handover(d.id)}>{t("handover")}</button>}
        </div>
      ))}
    </div>
  );
}
