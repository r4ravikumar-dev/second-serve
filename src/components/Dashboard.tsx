"use client";

import { useEffect, useState } from "react";
import { api, inr, useT } from "@/lib/client";
import type { AtRiskFlag, Impact } from "@/lib/types";
import { ErrorBox, Loading } from "./Badges";

type Data = { impact: Impact; trend: { date: string; sold: number; rescued: number; donated: number; leftover: number }[]; atRisk: AtRiskFlag[]; topWasted: [string, number][] };

export function Dashboard() {
  const { t } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Data>("/api/insights").then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;

  const max = Math.max(1, ...d.trend.map((x) => x.sold + x.rescued + x.donated + x.leftover));
  const kpis: [string, string, boolean][] = [
    [t("revenueRecovered"), inr(d.impact.revenueRecovered), true],
    [t("unitsRescued"), String(d.impact.unitsRescued), false],
    [t("mealsDonated"), String(d.impact.mealsDonated), false],
    [t("kgRescued"), String(d.impact.kgRescued), false],
  ];

  return (
    <div className="stack">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("dashboardTitle")}</h1>
      <div className="grid-2 grid-kpi">
        {kpis.map(([label, value, brand]) => (
          <div key={label} className="card card-tight kpi stack-sm">
            <span className={`value ${brand ? "brand" : ""} t-mobile-display-md`}>{value}</span>
            <span className="muted t-mobile-body-sm-regular">{label}</span>
          </div>
        ))}
      </div>
      <span className="muted t-mobile-body-xs-regular">{t("noShows")}: {d.impact.noShows}</span>

      <div className="card stack">
        <span className="t-mobile-heading-md">{t("trend")}</span>
        <div className="bars" role="img" aria-label={t("trend")}>
          {d.trend.map((x) => (
            <div key={x.date} className="bar-col" title={`${x.date}: ${t("sold")} ${x.sold}, ${t("rescued")} ${x.rescued}, ${t("donated")} ${x.donated}, ${t("wasted")} ${x.leftover}`}>
              <div className="bar-sold" style={{ height: `${(x.sold / max) * 100}%` }} />
              <div className="bar-rescued" style={{ height: `${(x.rescued / max) * 100}%` }} />
              <div className="bar-donated" style={{ height: `${(x.donated / max) * 100}%` }} />
              <div className="bar-wasted" style={{ height: `${(x.leftover / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="row t-mobile-body-xs-regular muted">
          <span className="row"><span className="legend bar-sold" />{t("sold")}</span>
          <span className="row"><span className="legend bar-rescued" />{t("rescued")}</span>
          <span className="row"><span className="legend bar-donated" />{t("donated")}</span>
          <span className="row"><span className="legend bar-wasted" />{t("wasted")}</span>
        </div>
      </div>

      {d.atRisk.length > 0 && (
        <div className="alert alert-warning stack-sm">
          <span className="t-mobile-heading-sm">{t("atRiskTitle")}</span>
          {d.atRisk.map((a) => <span key={a.stockItemId} className="t-mobile-body-sm-regular"><strong>{a.name}</strong> — {t("atRisk", { n: a.likelyLeftover })}{a.tomorrowReduceBy ? ` · ${t("reduceTomorrow", { n: a.tomorrowReduceBy })}` : ""}</span>)}
        </div>
      )}

      <div className="card stack-sm">
        <span className="t-mobile-heading-md">{t("topWasted")}</span>
        {d.topWasted.length === 0 ? <span className="muted t-mobile-body-sm-regular">{t("nothingYet")}</span>
          : d.topWasted.map(([name, n]) => <div key={name} className="row-between t-mobile-body-lg-regular"><span>{name}</span><span className="muted">{n}</span></div>)}
      </div>
    </div>
  );
}
