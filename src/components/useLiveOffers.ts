"use client";

import { useEffect, useState } from "react";
import { geohashQueryBounds } from "geofire-common";
import { api, distanceKm } from "@/lib/client";
import { firebaseApp, firebaseConfigured } from "@/lib/firebaseClient";
import type { PublicOffer } from "@/lib/types";

/**
 * Live nearby offers. With Firebase configured: Firestore real-time listeners on
 * the read-only publicOffers collection (1 read per change). Otherwise: polls
 * the API every 10 s (local demo mode).
 */
export function useLiveOffers(center: { lat: number; lng: number } | null, radiusKm = 5) {
  const [offers, setOffers] = useState<PublicOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const tidy = (rows: PublicOffer[]) => rows
      .filter((o) => o.qtyAvailable > 0 && o.pickupEnd > Date.now() && distanceKm(center, o.location) <= radiusKm)
      .sort((a, b) => distanceKm(center, a.location) - distanceKm(center, b.location));

    if (firebaseConfigured) {
      const unsubs: (() => void)[] = [];
      (async () => {
        const fs = await import("firebase/firestore");
        const db = fs.getFirestore(firebaseApp());
        const buckets = new Map<number, PublicOffer[]>();
        geohashQueryBounds([center.lat, center.lng], radiusKm * 1000).forEach(([start, end], i) => {
          const q = fs.query(fs.collection(db, "publicOffers"), fs.orderBy("geohash"), fs.startAt(start), fs.endAt(end), fs.limit(100));
          unsubs.push(fs.onSnapshot(q, (snap) => {
            buckets.set(i, snap.docs.map((d) => ({ ...(d.data() as PublicOffer), id: d.id })));
            const merged = new Map<string, PublicOffer>();
            for (const rows of buckets.values()) for (const o of rows) merged.set(o.id, o);
            if (!cancelled) setOffers(tidy([...merged.values()]));
          }, (e) => !cancelled && setError(e.message)));
        });
      })();
      return () => { cancelled = true; unsubs.forEach((u) => u()); };
    }

    const load = () => api<PublicOffer[]>(`/api/offers?lat=${center.lat}&lng=${center.lng}&radiusKm=${radiusKm}`)
      .then((rows) => !cancelled && (setOffers(tidy(rows)), setError(null)))
      .catch((e) => !cancelled && setError(e.message));
    load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [center?.lat, center?.lng, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  return { offers, error };
}

/** Browser location with a demo fallback. */
export function useLocation(fallback: { lat: number; lng: number }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  useEffect(() => {
    if (!navigator.geolocation) { setPos(fallback); setIsFallback(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setPos(fallback); setIsFallback(true); },
      { timeout: 6000, maximumAge: 300_000 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { pos, isFallback };
}
