import type { Donation, Merchant, Ngo, Offer, SalesDay, StockItem, User } from "@/lib/types";
import { DEFAULT_FOOD_SAFETY } from "./domain/onboarding";
import { toPublicOffer } from "./domain/projection";
import { salesDayId } from "./domain/stock";
import { dayKey, hourOf, weekdayOf } from "./domain/time";
import { geohash } from "./geo";
import { C, type Store } from "./store";

// Demo data for local runs and the pilot demo: Koramangala, Bengaluru.
// All demo ids start with "demo_" (the dev sign-in lists only these).

const CENTER = { lat: 12.9352, lng: 77.6245 };
const at = (dLat: number, dLng: number) => ({ lat: CENTER.lat + dLat, lng: CENTER.lng + dLng });

function user(id: string, role: User["role"], displayName: string, orgId?: string, locale: User["locale"] = "en"): User {
  return { id, role, displayName, email: `${id}@example.test`, ...(orgId ? { orgId } : {}), locale, activeReservations: 0, noShows: 0, createdAt: Date.now() };
}

function merchant(id: string, name: string, type: Merchant["type"], loc: { lat: number; lng: number }, status: Merchant["verification"]["status"], licence?: string): Merchant {
  const nextYear = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);
  return {
    id, name, type, address: `${name}, Koramangala, Bengaluru`, location: loc, geohash: geohash(loc),
    pickupHours: { open: "08:00", close: "22:00" },
    verification: status === "verified"
      ? { status, documentType: "fssai_state", licenceNumber: licence, licenceName: name, validUpto: nextYear, checks: { formatOk: true, numberMatches: true, notExpired: true, nameMatches: true }, extractedBy: "seed", reviewedBy: "demo_admin", reviewedAt: Date.now() }
      : { status },
    foodSafety: DEFAULT_FOOD_SAFETY,
    aiQuota: { date: "", drafts: 0, voice: 0, licence: 0 },
    createdAt: Date.now(),
  };
}

type ItemSeed = Omit<StockItem, "id" | "merchantId" | "date" | "preparedToday" | "remaining" | "lastUpdatedAt"> & { key: string; prepared: number; dailySales: number };

const BAKERY_ITEMS: ItemSeed[] = [
  { key: "croissant", name: "Butter croissant", nameEn: "Butter croissant", category: "bakery", vegMark: "egg", unit: "pc", usualPrice: 90, allergens: ["gluten", "dairy", "egg"], prepared: 40, dailySales: 28 },
  { key: "sourdough", name: "Sourdough loaf", nameEn: "Sourdough loaf", category: "bakery", vegMark: "veg", unit: "loaf", usualPrice: 220, allergens: ["gluten"], prepared: 15, dailySales: 11 },
  { key: "muffin", name: "Blueberry muffin", nameEn: "Blueberry muffin", category: "bakery", vegMark: "egg", unit: "pc", usualPrice: 80, allergens: ["gluten", "dairy", "egg"], prepared: 30, dailySales: 24 },
  { key: "pav", name: "लादी पाव", nameEn: "Ladi pav", category: "bakery", vegMark: "veg", unit: "pack", usualPrice: 40, allergens: ["gluten"], prepared: 25, dailySales: 20 },
];

const CAFE_ITEMS: ItemSeed[] = [
  { key: "thali", name: "Veg thali", nameEn: "Veg thali", category: "meals", vegMark: "veg", unit: "plate", usualPrice: 180, allergens: ["dairy"], prepared: 30, dailySales: 22 },
  { key: "biryani", name: "Chicken biryani", nameEn: "Chicken biryani", category: "meals", vegMark: "nonveg", unit: "box", usualPrice: 240, allergens: [], prepared: 25, dailySales: 21 },
  { key: "salad", name: "Sprouts salad", nameEn: "Sprouts salad", category: "fresh", vegMark: "veg", unit: "bowl", usualPrice: 120, allergens: [], prepared: 15, dailySales: 9 },
  { key: "laddoo", name: "बेसन लड्डू", nameEn: "Besan laddoo", category: "desserts", vegMark: "veg", unit: "box", usualPrice: 150, allergens: ["dairy", "nuts"], prepared: 12, dailySales: 8 },
];

// Hourly demand shape 08:00–22:00 (sums to 1).
const CURVE = (() => {
  const w = Array(24).fill(0);
  [[8, 6], [9, 9], [10, 7], [11, 6], [12, 10], [13, 10], [14, 6], [15, 5], [16, 6], [17, 8], [18, 9], [19, 8], [20, 6], [21, 4]].forEach(([h, v]) => (w[h] = v));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / total);
})();

function seededRand(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export async function seedDemo(store: Store, now = Date.now()): Promise<void> {
  const rand = seededRand(42);
  const today = dayKey(now);

  const merchants = [
    merchant("demo_m_bakery", "Crust & Crumb Bakery", "bakery", at(0.004, -0.003), "verified", "21419012000123"),
    merchant("demo_m_cafe", "Annapurna Café", "cafe", at(-0.005, 0.004), "verified", "11220333000456"),
    merchant("demo_m_new", "Spice Route Kitchen", "cloud_kitchen", at(0.007, 0.006), "pending"),
  ];
  const ngo: Ngo = {
    id: "demo_ngo", name: "Roti Bank Bengaluru", serviceArea: { ...CENTER, radiusKm: 8 },
    verification: { status: "verified", documentType: "ngo_registration", licenceNumber: "KA/2019/0234567", licenceName: "Roti Bank Bengaluru", reviewedBy: "demo_admin", reviewedAt: now },
    createdAt: now,
  };
  const users = [
    user("demo_customer", "customer", "Priya (customer)"),
    user("demo_customer_hi", "customer", "राहुल (ग्राहक)", undefined, "hi"),
    user("demo_staff_bakery", "merchant_staff", "Arjun · Crust & Crumb", "demo_m_bakery"),
    user("demo_staff_cafe", "merchant_staff", "सुनीता · Annapurna Café", "demo_m_cafe", "hi"),
    user("demo_staff_new", "merchant_staff", "Kiran · Spice Route (unverified)", "demo_m_new"),
    user("demo_ngo_member", "ngo_member", "Fatima · Roti Bank", "demo_ngo"),
    user("demo_admin", "admin", "Admin"),
    user("demo_newcomer", "customer", "Dev (new — onboard a business)"),
  ];

  for (const m of merchants) await store.set(C.merchants, m);
  await store.set(C.ngos, ngo);
  for (const u of users) await store.set(C.users, u);

  const nowHour = hourOf(now);
  for (const [m, items] of [[merchants[0], BAKERY_ITEMS], [merchants[1], CAFE_ITEMS]] as const) {
    // 28 days of history built from the demand curve with noise.
    for (let d = 28; d >= 1; d--) {
      const ts = now - d * 86_400_000;
      const date = dayKey(ts);
      const day: SalesDay = { id: salesDayId(m.id, date), merchantId: m.id, date, weekday: weekdayOf(ts), items: {} };
      for (const it of items) {
        const demand = Math.round(it.dailySales * (0.8 + rand() * 0.4));
        const soldTotal = Math.min(it.prepared, demand);
        const soldByHour = CURVE.map((f) => Math.round(f * soldTotal));
        const sold = soldByHour.reduce((a, b) => a + b, 0);
        const rescued = Math.round((it.prepared - sold) * 0.4);
        day.items[`demo_s_${m.id}_${it.key}`] = { prepared: it.prepared, soldByHour, leftover: it.prepared - sold - rescued, rescued, donated: 0 };
      }
      await store.set(C.salesDaily, day);
    }
    // Today: sold so far follows the curve, a bit slower than usual (so some items flag at-risk).
    const day: SalesDay = { id: salesDayId(m.id, today), merchantId: m.id, date: today, weekday: weekdayOf(now), items: {} };
    for (const it of items) {
      const id = `demo_s_${m.id}_${it.key}`;
      const soldByHour = CURVE.map((f, h) => (h < nowHour ? Math.round(f * it.dailySales * 0.75) : 0));
      const sold = Math.min(it.prepared, soldByHour.reduce((a, b) => a + b, 0));
      const { key: _k, prepared, dailySales, ...rest } = it;
      const stock: StockItem = { ...rest, id, merchantId: m.id, usualDailySales: dailySales, date: today, preparedToday: prepared, remaining: prepared - sold, lastUpdatedAt: now };
      await store.set(C.stock, stock);
      day.items[id] = { prepared, soldByHour, leftover: 0, rescued: 0, donated: 0 };
    }
    await store.set(C.salesDaily, day);
  }

  // Two live offers + one open donation so the maps aren't empty.
  const end = Math.max(now + 2 * 3_600_000, now);
  const offers: Offer[] = [
    {
      id: "demo_off_1", merchantId: "demo_m_bakery", merchantName: "Crust & Crumb Bakery", title: "Bakery surprise bag", titleHi: "बेकरी सरप्राइज़ बैग",
      category: "bakery", vegMark: "egg", items: [{ name: "Butter croissant", qty: 2 }, { name: "Blueberry muffin", qty: 1 }],
      allergensConfirmed: ["gluten", "dairy", "egg"], originalPrice: 260, price: 120, qtyTotal: 5, qtyAvailable: 5,
      pickupStart: now, pickupEnd: end, location: merchants[0].location, geohash: merchants[0].geohash, status: "live",
      safetyAttestation: { preparedAt: now - 4 * 3_600_000, storage: "ambient", attestedBy: "demo_staff_bakery" }, createdAt: now,
    },
    {
      id: "demo_off_2", merchantId: "demo_m_cafe", merchantName: "Annapurna Café", title: "Veg thali (rescue)", titleHi: "वेज थाली (रेस्क्यू)",
      category: "meals", vegMark: "veg", items: [{ name: "Veg thali", qty: 1 }],
      allergensConfirmed: ["dairy"], originalPrice: 180, price: 90, qtyTotal: 4, qtyAvailable: 4,
      pickupStart: now, pickupEnd: end, location: merchants[1].location, geohash: merchants[1].geohash, status: "live",
      safetyAttestation: { preparedAt: now - 2 * 3_600_000, storage: "hot_held", attestedBy: "demo_staff_cafe" }, createdAt: now,
    },
  ];
  for (const o of offers) { await store.set(C.offers, o); await store.set(C.publicOffers, toPublicOffer(o)); }

  const donation: Donation = {
    id: "demo_don_1", merchantId: "demo_m_cafe", merchantName: "Annapurna Café", items: [{ name: "Veg thali", qty: 6 }],
    estimatedMeals: 6, estimatedKg: 3, location: merchants[1].location, geohash: merchants[1].geohash,
    safetyAttestation: { preparedAt: now - 2 * 3_600_000, storage: "hot_held", allergens: ["dairy"], attestedBy: "demo_staff_cafe" },
    status: "offered", pickupWindow: { start: now, end: now + 3 * 3_600_000 }, createdAt: now,
  };
  await store.set(C.donations, donation);
}
