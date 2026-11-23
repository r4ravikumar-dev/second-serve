"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/client";

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone?: "brand" | "warning" | "info" | "success" | "error";
  title?: string;
}

const KEY = process.env.NEXT_PUBLIC_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_MAPS_MAP_ID || "DEMO_MAP_ID";

type G = { maps: { importLibrary: (n: string) => Promise<Record<string, unknown>> } };
let loader: Promise<G> | null = null;

/** Loads the Maps JS API once. Map loads are quota-capped (300/day) — see README. */
function loadGoogleMaps(): Promise<G> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const w = window as unknown as { google?: G; __ssMapsReady?: () => void; gm_authFailure?: () => void };
    if (w.google?.maps) return resolve(w.google);
    w.__ssMapsReady = () => resolve(w.google!);
    w.gm_authFailure = () => reject(new Error("maps_auth_failed"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY!)}&v=weekly&loading=async&callback=__ssMapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error("maps_load_failed"));
    document.head.appendChild(s);
  });
  loader.catch(() => { loader = null; });
  return loader;
}

export function OfferMap({ center, pins, selectedId, onSelect, onUnavailable }: {
  center: { lat: number; lng: number };
  pins: Pin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onUnavailable?: () => void;
}) {
  return KEY
    ? <GoogleMap center={center} pins={pins} selectedId={selectedId} onSelect={onSelect} onUnavailable={onUnavailable} />
    : <SchematicMap center={center} pins={pins} selectedId={selectedId} onSelect={onSelect} />;
}

function GoogleMap({ center, pins, selectedId, onSelect, onUnavailable }: Parameters<typeof OfferMap>[0]) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<unknown>(null);
  const markers = useRef<{ map: unknown }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps().then(async (g) => {
      const { Map } = (await g.maps.importLibrary("maps")) as { Map: new (el: HTMLElement, o: object) => unknown };
      if (!alive || !el.current) return;
      map.current = new Map(el.current, { center, zoom: 14, mapId: MAP_ID, disableDefaultUI: true, zoomControl: true, clickableIcons: false });
      setReady(true);
    }).catch(() => alive && onUnavailable?.());
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const g = (window as unknown as { google: G }).google;
      const { AdvancedMarkerElement } = (await g.maps.importLibrary("marker")) as { AdvancedMarkerElement: new (o: object) => { map: unknown; addListener: (e: string, f: () => void) => void } };
      if (!alive) return;
      markers.current.forEach((m) => { m.map = null; });
      markers.current = [...pins.map((p) => {
        const div = document.createElement("div");
        div.className = `pin ${p.tone && p.tone !== "brand" ? p.tone : ""} ${p.id === selectedId ? "selected" : ""} t-mobile-label-sm-semibold`;
        div.textContent = p.label;
        const m = new AdvancedMarkerElement({ map: map.current, position: { lat: p.lat, lng: p.lng }, content: div, title: p.title ?? p.label });
        m.addListener("click", () => onSelect?.(p.id));
        return m;
      }), (() => {
        const me = document.createElement("div");
        me.className = "me-dot";
        return new AdvancedMarkerElement({ map: map.current, position: center, content: me, title: "You" });
      })()];
    })();
    return () => { alive = false; };
  }, [ready, pins, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="map-box" ref={el} />;
}

/** No Maps key (local demo): a simple schematic so the layout and pins still work. */
function SchematicMap({ center, pins, selectedId, onSelect }: Parameters<typeof OfferMap>[0]) {
  const { t } = useT();
  const span = Math.max(0.01, ...pins.map((p) => Math.max(Math.abs(p.lat - center.lat), Math.abs(p.lng - center.lng)))) * 1.3;
  const pos = (lat: number, lng: number) => ({ left: `${50 + ((lng - center.lng) / span) * 45}%`, top: `${50 - ((lat - center.lat) / span) * 45}%` });
  return (
    <div className="map-box">
      <svg className="map-svg" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <line className="grid" x1={`${i * 12.5}%`} y1="0" x2={`${i * 12.5}%`} y2="100%" />
            <line className="grid" x1="0" y1={`${i * 12.5}%`} x2="100%" y2={`${i * 12.5}%`} />
          </g>
        ))}
      </svg>
      <span className="me-dot" style={{ position: "absolute", ...pos(center.lat, center.lng), transform: "translate(-50%,-50%)" }} />
      {pins.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pin ${p.tone && p.tone !== "brand" ? p.tone : ""} ${p.id === selectedId ? "selected" : ""} t-mobile-label-sm-semibold`}
          style={{ position: "absolute", ...pos(p.lat, p.lng), transform: "translate(-50%,-50%)" }}
          onClick={() => onSelect?.(p.id)}
          title={p.title ?? p.label}
        >
          {p.label}
        </button>
      ))}
      <span className="map-caption t-mobile-body-xs-regular muted">{t("mapPreview")}</span>
    </div>
  );
}
