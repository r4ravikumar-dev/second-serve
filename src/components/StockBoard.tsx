"use client";

import { useEffect, useState } from "react";
import { api, inr, uploadFile, useT } from "@/lib/client";
import { CATEGORIES, type AtRiskFlag, type StockItem } from "@/lib/types";
import { categoryKey } from "@/lib/i18n";
import { ErrorBox, Loading, VegMark } from "./Badges";
import { IconMic } from "./Icons";
import { useRecorder } from "./useRecorder";

type Proposal = { stockItemId: string; name: string; current: number; proposed: number; confidence: number };

export function StockBoard() {
  const { t } = useT();
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskFlag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [proposals, setProposals] = useState<{ list: Proposal[]; keep: Record<string, boolean>; unmatched: string[]; transcript: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const recorder = useRecorder();

  const load = () => api<{ items: StockItem[]; atRisk: AtRiskFlag[] }>("/api/stock").then((r) => { setItems(r.items); setAtRisk(r.atRisk); }).catch((e) => setError(e.message));
  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, []);

  const change = async (id: string, body: object) => {
    setError(null);
    try { const next = await api<StockItem>(`/api/stock/${id}`, { body }); setItems((xs) => xs?.map((x) => (x.id === id ? next : x)) ?? null); load(); }
    catch (e) { setError((e as Error).message); }
  };

  const askSet = (item: StockItem, field: "setRemaining" | "setPrepared") => {
    const v = prompt(`${item.name}: ${field === "setRemaining" ? t("setLeft") : t("setPrepared")}`, String(field === "setRemaining" ? item.remaining : item.preparedToday));
    if (v !== null && /^\d+$/.test(v.trim())) change(item.id, { [field]: Number(v) });
  };

  const sendUpdate = async (body: object) => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ proposals: Proposal[]; unmatched: string[]; transcript: string }>("/api/stock/voice", { body });
      setProposals({ list: r.proposals, keep: Object.fromEntries(r.proposals.map((p) => [p.stockItemId, true])), unmatched: r.unmatched, transcript: r.transcript });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleVoice = async () => {
    if (!recorder.recording) { try { await recorder.start(); } catch (e) { setError((e as Error).message); } return; }
    const blob = await recorder.stop();
    if (!blob) return;
    setBusy(true);
    try { const path = await uploadFile(blob, "audio"); await sendUpdate({ audioPath: path, mimeType: blob.type }); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const applyProposals = async () => {
    if (!proposals) return;
    const updates = proposals.list.filter((p) => proposals.keep[p.stockItemId]).map((p) => ({ stockItemId: p.stockItemId, setRemaining: p.proposed }));
    if (updates.length) { try { await api("/api/stock/apply", { body: { updates } }); } catch (e) { setError((e as Error).message); } }
    setProposals(null); setText(""); load();
  };

  const rescue = async () => {
    const sel = (items ?? []).filter((i) => selected[i.id] && i.remaining > 0).map((i) => ({ stockItemId: i.id, qty: i.remaining }));
    if (!sel.length) return;
    setBusy(true); setError(null);
    try { const d = await api<{ id: string }>("/api/surplus", { body: { source: "stock", selected: sel } }); window.location.href = `/merchant/rescue/${d.id}`; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  if (!items) return error ? <ErrorBox message={error} /> : <Loading />;
  const risk = new Map(atRisk.map((a) => [a.stockItemId, a]));
  const nSel = Object.values(selected).filter(Boolean).length;

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("liveStock")}</h1>
          <span className="muted t-mobile-body-sm-regular">{t("stockHint")}</span>
        </div>
        <button type="button" className={`btn ${recorder.recording ? "btn-record" : "btn-primary"} t-mobile-label-xl-medium`} disabled={busy} onClick={toggleVoice}>
          <IconMic className="icon" /> {recorder.recording ? t("recording") : t("voiceUpdate")}
        </button>
      </div>
      {error && <ErrorBox message={error} />}

      <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendUpdate({ text }); }}>
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeUpdatePlaceholder")} aria-label={t("typeUpdate")} />
        <button className="btn btn-secondary t-mobile-label-xl-medium" disabled={busy || !text.trim()}>{t("typeUpdate")}</button>
      </form>

      {proposals && (
        <div className="card stack-sm">
          <span className="t-mobile-heading-md">{t("proposedChanges")}</span>
          {proposals.transcript && <span className="muted t-mobile-body-sm-regular">“{proposals.transcript}”</span>}
          {proposals.list.map((p) => (
            <label key={p.stockItemId} className="check t-mobile-body-lg-regular">
              <input type="checkbox" checked={!!proposals.keep[p.stockItemId]} onChange={(e) => setProposals({ ...proposals, keep: { ...proposals.keep, [p.stockItemId]: e.target.checked } })} />
              <span>{p.name}: {p.current} → <strong>{p.proposed}</strong></span>
            </label>
          ))}
          {proposals.unmatched.length > 0 && <span className="muted t-mobile-body-sm-regular">{t("unmatched")}: {proposals.unmatched.join(", ")}</span>}
          <div className="row">
            <button type="button" className="btn btn-primary t-mobile-label-xl-medium" onClick={applyProposals} disabled={!proposals.list.length}>{t("apply")}</button>
            <button type="button" className="btn btn-ghost t-mobile-label-xl-medium" onClick={() => setProposals(null)}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {atRisk.length > 0 && (
        <div className="alert alert-warning stack-sm">
          <span className="t-mobile-heading-sm">{t("atRiskTitle")}</span>
          {atRisk.map((a) => (
            <span key={a.stockItemId} className="t-mobile-body-sm-regular">
              <strong>{a.name}</strong> — {t("atRisk", { n: a.likelyLeftover })}. {a.action === "donate_at_close" ? t("actionDonate") : t("actionDiscount", { t: a.suggestedDiscountAt ?? "" })}
              {a.tomorrowReduceBy ? ` · ${t("reduceTomorrow", { n: a.tomorrowReduceBy })}` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="stock-grid">
        {items.map((i) => {
          const r = risk.get(i.id);
          return (
            <div key={i.id} className={`card card-tight stock-tile ${i.remaining === 0 ? "out" : ""} ${selected[i.id] ? "selected" : ""}`}>
              <div className="row-between">
                <div className="row"><VegMark mark={i.vegMark} /><span className="t-mobile-heading-sm">{i.name}</span></div>
              </div>
              <span className="muted t-mobile-body-xs-regular">{t(categoryKey(i.category))} · {inr(i.usualPrice)} · {t("prepared")} {i.preparedToday}</span>
              <div className="counter-row">
                <button type="button" className="btn btn-round t-mobile-heading-md" aria-label={`${i.name} −1`} onClick={() => change(i.id, { delta: -1 })}>−</button>
                <button type="button" className="count t-mobile-display-sm" style={{ border: 0, background: "none", cursor: "pointer" }} onClick={() => askSet(i, "setRemaining")} title={t("setLeft")}>{i.remaining}</button>
                <button type="button" className="btn btn-round t-mobile-heading-md" aria-label={`${i.name} +1`} onClick={() => change(i.id, { delta: 1 })}>+</button>
              </div>
              {r && <span className="badge badge-warning t-mobile-label-sm-medium">{t("atRisk", { n: r.likelyLeftover })}</span>}
              <div className="row-between">
                <button type="button" className="btn btn-ghost btn-sm t-mobile-label-md-medium" onClick={() => askSet(i, "setPrepared")}>{t("setPrepared")}</button>
                <label className="check t-mobile-label-md-medium"><input type="checkbox" checked={!!selected[i.id]} disabled={i.remaining === 0} onChange={(e) => setSelected({ ...selected, [i.id]: e.target.checked })} />{t("select")}</label>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary btn-block t-mobile-label-xl-medium" disabled={busy || nSel === 0} onClick={rescue}>{t("rescueSelected")} {nSel ? `(${nSel})` : ""}</button>
      {adding ? <AddItem onDone={() => { setAdding(false); load(); }} /> : <button type="button" className="btn btn-secondary t-mobile-label-xl-medium" onClick={() => setAdding(true)}>+ {t("addItem")}</button>}
    </div>
  );
}

function AddItem({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", nameEn: "", category: "bakery", vegMark: "veg", usualPrice: "", usualDailySales: "" });
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await api("/api/stock", { body: { name: f.name, nameEn: f.nameEn || f.name, category: f.category, vegMark: f.vegMark, unit: "pc", usualPrice: Number(f.usualPrice), allergens: [], ...(f.usualDailySales ? { usualDailySales: Number(f.usualDailySales) } : {}) } });
      onDone();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="card stack-sm">
      {error && <ErrorBox message={error} />}
      <label className="field t-mobile-label-lg-medium"><span>{t("itemName")}</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field t-mobile-label-lg-medium"><span>{t("itemNameEn")}</span><input className="input" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></label>
      <div className="grid-2">
        <label className="field t-mobile-label-lg-medium"><span>{t("category")}</span>
          <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(categoryKey(c))}</option>)}</select>
        </label>
        <label className="field t-mobile-label-lg-medium"><span>{t("vegMark")}</span>
          <select className="select" value={f.vegMark} onChange={(e) => setF({ ...f, vegMark: e.target.value })}><option value="veg">{t("veg")}</option><option value="egg">{t("egg")}</option><option value="nonveg">{t("nonveg")}</option></select>
        </label>
        <label className="field t-mobile-label-lg-medium"><span>{t("price")}</span><input className="input" inputMode="numeric" value={f.usualPrice} onChange={(e) => setF({ ...f, usualPrice: e.target.value })} /></label>
        <label className="field t-mobile-label-lg-medium"><span>{t("usualSales")}</span><input className="input" inputMode="numeric" value={f.usualDailySales} onChange={(e) => setF({ ...f, usualDailySales: e.target.value })} /></label>
      </div>
      <p className="muted t-mobile-body-xs-regular">{t("allergens")}: {t("confirmAllergens")} →</p>
      <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={!f.name || !f.usualPrice} onClick={save}>{t("save")}</button>
    </div>
  );
}
