"use client";

import { useEffect, useState } from "react";
import { api, fromLocalInput, inr, toLocalInput, useT } from "@/lib/client";
import { categoryKey } from "@/lib/i18n";
import { ALLERGENS, CATEGORIES, type Allergen, type SurplusDraft } from "@/lib/types";
import { ErrorBox, Loading } from "./Badges";
import { IconSpark } from "./Icons";

export function DraftReview({ draftId }: { draftId: string; closeHhmm: string }) {
  const { t } = useT();
  const [d, setD] = useState<SurplusDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"offer" | "donation" | null>(null);
  const [f, setF] = useState<null | {
    channel: "sell" | "donate"; title: string; titleHi: string; category: string; vegMark: string; packs: number;
    originalPricePerPack: number; pricePerPack: number; items: { stockItemId?: string; name: string; qtyPerPack: number }[];
    allergens: Allergen[]; allergenCheckDone: boolean; preparedAt: string; storage: string; pickupStart: string; pickupEnd: string;
  }>(null);

  useEffect(() => {
    api<SurplusDraft>(`/api/surplus/${draftId}`).then((draft) => {
      setD(draft);
      const b = draft.bundles[0];
      const bundleItems = b ? b.itemIndexes.map((i) => draft.items[i]) : draft.items.slice(0, 1);
      // Bundle = 1 of each item per pack; packs limited by the scarcest item.
      const packs = Math.max(1, Math.min(...bundleItems.map((i) => i.qty)));
      const original = b ? b.originalPrice : bundleItems[0].unitPrice;
      setF({
        channel: "sell", title: b?.title ?? bundleItems[0].nameEn, titleHi: b?.titleHi ?? "",
        category: bundleItems[0].category, vegMark: bundleItems.some((i) => i.vegMark === "nonveg") ? "nonveg" : bundleItems.some((i) => i.vegMark === "egg") ? "egg" : "veg",
        packs, originalPricePerPack: original, pricePerPack: b ? b.suggestedPrice : Math.round(original * 0.5),
        items: bundleItems.map((i) => ({ stockItemId: i.stockItemId, name: i.nameEn, qtyPerPack: 1 })),
        allergens: [...new Set(bundleItems.flatMap((i) => i.allergensSuspected))], allergenCheckDone: false,
        preparedAt: toLocalInput(Date.now() - 2 * 3_600_000), storage: "ambient",
        pickupStart: toLocalInput(draft.pickupWindow.start), pickupEnd: toLocalInput(draft.pickupWindow.end),
      });
    }).catch((e) => setError(e.message));
  }, [draftId]);

  if (error && !d) return <ErrorBox message={error} />;
  if (!d || !f) return <Loading />;
  if (d.status !== "draft" && !done) return <div className="alert alert-neutral t-mobile-body-lg-regular">{d.status}</div>;
  if (done) return (
    <div className="alert alert-success-solid stack-sm">
      <span className="t-mobile-heading-lg">{done === "offer" ? t("published") : t("donationOffered")}</span>
      <a className="btn btn-secondary t-mobile-label-xl-medium" href="/merchant">{t("navStock")}</a>
    </div>
  );

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const approve = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ kind: "offer" | "donation" }>(`/api/surplus/${draftId}`, { body: {
        channel: f.channel, title: f.title, ...(f.titleHi ? { titleHi: f.titleHi } : {}), category: f.category, vegMark: f.vegMark,
        packs: f.packs, originalPricePerPack: f.originalPricePerPack, pricePerPack: f.channel === "donate" ? 0 : f.pricePerPack,
        items: f.items, allergensConfirmed: f.allergens, allergenCheckDone: f.allergenCheckDone,
        preparedAt: fromLocalInput(f.preparedAt), storage: f.storage,
        pickupStart: fromLocalInput(f.pickupStart), pickupEnd: fromLocalInput(f.pickupEnd),
      } });
      setDone(r.kind);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const reject = async () => {
    const reason = prompt(t("reject") + "?", "") ?? null;
    if (reason === null) return;
    await api(`/api/surplus/${draftId}`, { method: "DELETE", body: { reason } }).catch(() => undefined);
    window.location.href = "/merchant";
  };
  const discount = f.originalPricePerPack ? Math.round((1 - f.pricePerPack / f.originalPricePerPack) * 100) : 0;

  return (
    <div className="stack">
      <div className="alert alert-info row t-mobile-body-sm-regular"><IconSpark className="icon" /> {t("aiSuggested")} ({d.model})</div>
      {d.warnings.length > 0 && <div className="alert alert-warning t-mobile-body-sm-regular"><strong>{t("aiWarnings")}:</strong> {d.warnings.join(" · ")}</div>}
      {d.notes && <p className="muted t-mobile-body-sm-regular" style={{ margin: 0 }}>{d.notes}</p>}

      <div className="segmented" role="group">
        <button type="button" className="t-mobile-label-xl-medium" aria-pressed={f.channel === "sell"} onClick={() => set({ channel: "sell" })}>{t("sell")}</button>
        <button type="button" className="t-mobile-label-xl-medium" aria-pressed={f.channel === "donate"} onClick={() => set({ channel: "donate" })}>{t("donate")}</button>
      </div>

      <div className="card stack">
        <label className="field t-mobile-label-lg-medium ai-field"><span>{t("title")}</span><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="field t-mobile-label-lg-medium"><span>{t("titleHi")}</span><input className="input" lang="hi" value={f.titleHi} onChange={(e) => set({ titleHi: e.target.value })} /></label>
        <div className="stack-sm">
          <span className="t-mobile-label-lg-medium muted">{t("items")} ({t("perPack")})</span>
          {f.items.map((it, idx) => (
            <div key={idx} className="row-between t-mobile-body-lg-regular">
              <span>{it.name}</span>
              <input className="input" style={{ width: 80 }} inputMode="numeric" value={it.qtyPerPack} onChange={(e) => set({ items: f.items.map((x, j) => (j === idx ? { ...x, qtyPerPack: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
            </div>
          ))}
        </div>
        <div className="grid-2">
          <label className="field t-mobile-label-lg-medium"><span>{t("category")}</span>
            <select className="select" value={f.category} onChange={(e) => set({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(categoryKey(c))}</option>)}</select>
          </label>
          <label className="field t-mobile-label-lg-medium"><span>{t("vegMark")}</span>
            <select className="select" value={f.vegMark} onChange={(e) => set({ vegMark: e.target.value })}><option value="veg">{t("veg")}</option><option value="egg">{t("egg")}</option><option value="nonveg">{t("nonveg")}</option></select>
          </label>
          <label className="field t-mobile-label-lg-medium ai-field"><span>{t("packs")}</span><input className="input" inputMode="numeric" value={f.packs} onChange={(e) => set({ packs: Math.max(1, Number(e.target.value) || 1) })} /></label>
          <label className="field t-mobile-label-lg-medium"><span>{t("originalPrice")}</span><input className="input" inputMode="numeric" value={f.originalPricePerPack} onChange={(e) => set({ originalPricePerPack: Number(e.target.value) || 0 })} /></label>
          {f.channel === "sell" && <label className="field t-mobile-label-lg-medium ai-field"><span>{t("rescuePrice")} (−{discount}%)</span><input className="input" inputMode="numeric" value={f.pricePerPack} onChange={(e) => set({ pricePerPack: Number(e.target.value) || 0 })} /></label>}
          <label className="field t-mobile-label-lg-medium"><span>{t("storage")}</span>
            <select className="select" value={f.storage} onChange={(e) => set({ storage: e.target.value })}><option value="ambient">{t("ambient")}</option><option value="chilled">{t("chilled")}</option><option value="hot_held">{t("hotHeld")}</option></select>
          </label>
          <label className="field t-mobile-label-lg-medium"><span>{t("preparedAt")}</span><input className="input" type="datetime-local" value={f.preparedAt} onChange={(e) => set({ preparedAt: e.target.value })} /></label>
          <label className="field t-mobile-label-lg-medium ai-field"><span>{t("pickupStart")}</span><input className="input" type="datetime-local" value={f.pickupStart} onChange={(e) => set({ pickupStart: e.target.value })} /></label>
          <label className="field t-mobile-label-lg-medium ai-field"><span>{t("pickupEnd")}</span><input className="input" type="datetime-local" value={f.pickupEnd} onChange={(e) => set({ pickupEnd: e.target.value })} /></label>
        </div>
      </div>

      <div className="alert alert-warning stack-sm">
        <span className="t-mobile-heading-sm">{t("confirmAllergens")}</span>
        <div className="row">
          {ALLERGENS.map((a) => (
            <label key={a} className="check t-mobile-label-lg-medium">
              <input type="checkbox" checked={f.allergens.includes(a)} onChange={(e) => set({ allergens: e.target.checked ? [...f.allergens, a] : f.allergens.filter((x) => x !== a), allergenCheckDone: false })} />{a}
            </label>
          ))}
        </div>
        <label className="check t-mobile-body-lg-medium"><input type="checkbox" checked={f.allergenCheckDone} onChange={(e) => set({ allergenCheckDone: e.target.checked })} />{t("allergenCheck")}</label>
      </div>

      {error && <ErrorBox message={error} />}
      <button type="button" className="btn btn-primary btn-block t-mobile-label-xl-medium" disabled={busy || !f.allergenCheckDone} onClick={approve}>
        {f.channel === "sell" ? `${t("publish")} · ${f.packs} × ${inr(f.pricePerPack)}` : t("publishDonation")}
      </button>
      <button type="button" className="btn btn-danger t-mobile-label-xl-medium" onClick={reject}>{t("reject")}</button>
    </div>
  );
}
