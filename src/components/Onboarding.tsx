"use client";

import { useState } from "react";
import { api, DEMO_CENTER, uploadFile, useT } from "@/lib/client";
import { categoryKey } from "@/lib/i18n";
import { CATEGORIES, type Category, type FoodSafety, type Verification } from "@/lib/types";
import { ErrorBox } from "./Badges";

export function CreateOrg({ kind }: { kind: "merchant" | "ngo" }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", type: "cafe", address: "", open: "08:00", close: "22:00", radiusKm: "8" });
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => setLoc(DEMO_CENTER),
  );

  const create = async () => {
    setBusy(true); setError(null);
    try {
      if (kind === "merchant") await api("/api/merchants", { body: { name: f.name, type: f.type, address: f.address, location: loc, pickupHours: { open: f.open, close: f.close } } });
      else await api("/api/ngos", { body: { name: f.name, serviceArea: { ...loc!, radiusKm: Number(f.radiusKm) } } });
      // Role changed server-side: start a fresh page so the new navigation loads.
      window.location.href = kind === "merchant" ? "/merchant/profile" : "/ngo/profile";
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="segmented" role="group">
        <a href="/onboard?kind=merchant" className="t-mobile-label-xl-medium btn btn-sm" aria-pressed={kind === "merchant"} style={kind === "merchant" ? { background: "var(--bg-brand-normal)", color: "var(--text-brand-on-primary)" } : {}}>{t("onboardTitle")}</a>
        <a href="/onboard?kind=ngo" className="t-mobile-label-xl-medium btn btn-sm" aria-pressed={kind === "ngo"} style={kind === "ngo" ? { background: "var(--bg-brand-normal)", color: "var(--text-brand-on-primary)" } : {}}>{t("ngoOnboardTitle")}</a>
      </div>
      <div className="card stack">
        <label className="field t-mobile-label-lg-medium"><span>{kind === "merchant" ? t("businessName") : t("ngoName")}</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        {kind === "merchant" ? (
          <>
            <label className="field t-mobile-label-lg-medium"><span>{t("businessType")}</span>
              <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {["cafe", "restaurant", "bakery", "cloud_kitchen", "retail"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
              </select>
            </label>
            <label className="field t-mobile-label-lg-medium"><span>{t("address")}</span><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
            <div className="grid-2">
              <label className="field t-mobile-label-lg-medium"><span>{t("open")}</span><input className="input" type="time" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} /></label>
              <label className="field t-mobile-label-lg-medium"><span>{t("close")}</span><input className="input" type="time" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></label>
            </div>
          </>
        ) : (
          <label className="field t-mobile-label-lg-medium"><span>{t("serviceRadius")}</span><input className="input" inputMode="numeric" value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} /></label>
        )}
        <div className="row-between">
          <span className="t-mobile-label-lg-medium muted">{t("location")}: {loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : "—"}</span>
          <button type="button" className="btn btn-secondary btn-sm t-mobile-label-lg-medium" onClick={locate}>{t("useMyLocation")}</button>
        </div>
        {error && <ErrorBox message={error} />}
        <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={busy || !f.name || !loc || (kind === "merchant" && f.address.length < 5)} onClick={create}>{t("create")}</button>
      </div>
    </div>
  );
}

export function VerificationPanel({ kind, verification }: { kind: "merchant" | "ngo"; verification: Verification }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [num, setNum] = useState("");
  const [v, setV] = useState(verification);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const docPath = await uploadFile(file, "licence");
      setV(await api<Verification>("/api/verification", { body: { docPath, typedNumber: num, mimeType: file.type } }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const stage = { pending: 0, rejected: 0, suspended: 0, auto_checked: 2, verified: 3 }[v.status];
  const steps = [t("stepUpload"), t("stepChecks"), t("stepReview"), t("stepVerified")];
  const status = {
    pending: <div className="alert alert-neutral t-mobile-body-sm-regular">{t("statusPending")}</div>,
    auto_checked: <div className="alert alert-info t-mobile-body-sm-regular">{t("statusAutoChecked")}</div>,
    verified: <div className="alert alert-success t-mobile-body-sm-regular">✓ {t("statusVerified")}{v.validUpto ? ` · ${v.validUpto}` : ""}</div>,
    rejected: <div className="alert alert-error t-mobile-body-sm-regular">{t("statusRejected", { reason: v.rejectReason ?? "" })}</div>,
    suspended: <div className="alert alert-error t-mobile-body-sm-regular">{t("statusSuspended")}</div>,
  }[v.status];

  return (
    <div className="card stack">
      <span className="t-mobile-heading-lg">{kind === "merchant" ? t("verificationTitle") : t("ngoVerificationTitle")}</span>
      <div className="stepper">
        {steps.map((s, i) => <div key={s} className={`step ${i < stage || (i === 3 && stage === 3) ? "done" : i === stage ? "current" : ""} t-mobile-label-sm-medium`}><span className="dot" />{s}</div>)}
      </div>
      {status}
      {v.checks && <Checks checks={v.checks} />}
      {(v.status === "pending" || v.status === "rejected" || v.status === "suspended") && (
        <div className="stack-sm">
          <label className="field t-mobile-label-lg-medium"><span>{kind === "merchant" ? t("uploadLicence") : t("uploadNgoDoc")}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field t-mobile-label-lg-medium"><span>{kind === "merchant" ? t("licenceNumber") : t("ngoNumber")}</span>
            <input className="input" inputMode={kind === "merchant" ? "numeric" : "text"} value={num} onChange={(e) => setNum(e.target.value)} />
          </label>
          {error && <ErrorBox message={error} />}
          <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={busy || !file || num.trim().length < 4} onClick={submit}>{busy ? t("loading") : t("submit")}</button>
        </div>
      )}
    </div>
  );
}

export function Checks({ checks }: { checks: NonNullable<Verification["checks"]> }) {
  const { t } = useT();
  const rows: [string, boolean][] = [[t("checkFormat"), checks.formatOk], [t("checkNumber"), checks.numberMatches], [t("checkExpiry"), checks.notExpired], [t("checkName"), checks.nameMatches]];
  return (
    <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map(([label, ok]) => <li key={label} className="row t-mobile-body-sm-regular"><span className={ok ? "ok" : "fail"} aria-hidden>{ok ? "✓" : "✗"}</span>{label}</li>)}
    </ul>
  );
}

export function FoodSafetySettings({ initial }: { initial: FoodSafety }) {
  const { t } = useT();
  const [fs, setFs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (key: "allowedSaleCategories" | "donationEligibleCategories", c: Category) =>
    setFs({ ...fs, [key]: fs[key].includes(c) ? fs[key].filter((x) => x !== c) : [...fs[key], c] });
  const save = async () => {
    setError(null);
    try { await api("/api/merchants", { method: "PATCH", body: { foodSafety: fs } }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="card stack">
      <span className="t-mobile-heading-lg">{t("foodSafety")}</span>
      {(["allowedSaleCategories", "donationEligibleCategories"] as const).map((key) => (
        <div key={key} className="stack-sm">
          <span className="t-mobile-label-lg-medium muted">{key === "allowedSaleCategories" ? t("sellCategories") : t("donateCategories")}</span>
          <div className="row">{CATEGORIES.map((c) => <label key={c} className="check t-mobile-label-lg-medium"><input type="checkbox" checked={fs[key].includes(c)} onChange={() => toggle(key, c)} />{t(categoryKey(c))}</label>)}</div>
        </div>
      ))}
      <span className="t-mobile-label-lg-medium muted">{t("maxHours")}</span>
      <div className="grid-2">
        {CATEGORIES.map((c) => (
          <label key={c} className="field t-mobile-label-md-medium"><span>{t(categoryKey(c))}</span>
            <input className="input" inputMode="numeric" value={fs.maxHoursSincePrep[c] ?? ""} onChange={(e) => setFs({ ...fs, maxHoursSincePrep: { ...fs.maxHoursSincePrep, [c]: Number(e.target.value) || undefined } })} />
          </label>
        ))}
      </div>
      {error && <ErrorBox message={error} />}
      <button type="button" className="btn btn-secondary t-mobile-label-xl-medium" onClick={save}>{saved ? "✓" : t("save")}</button>
    </div>
  );
}
