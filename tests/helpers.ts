import type { Merchant, Ngo, StockItem, User } from "@/lib/types";
import { DEFAULT_FOOD_SAFETY } from "@/server/domain/onboarding";
import { dayKey } from "@/server/domain/time";
import { geohash } from "@/server/geo";
import { C, setStoreForTests } from "@/server/store";
import { MemoryStore } from "@/server/store/memory";

export const CENTER = { lat: 12.9352, lng: 77.6245 };

/** 2026-11-22 14:00 IST — a fixed "now" so tests don't depend on the clock. */
export const NOW = Date.parse("2026-11-22T14:00:00+05:30");

export function user(id: string, role: User["role"], orgId?: string): User {
  return { id, role, displayName: id, email: `${id}@test`, ...(orgId ? { orgId } : {}), locale: "en", activeReservations: 0, noShows: 0, createdAt: NOW };
}

export function merchant(id = "m1", status: Merchant["verification"]["status"] = "verified"): Merchant {
  return {
    id, name: "Crust & Crumb Bakery", type: "bakery", address: "Koramangala", location: CENTER, geohash: geohash(CENTER),
    pickupHours: { open: "08:00", close: "22:00" }, verification: { status, validUpto: "2027-06-30" },
    foodSafety: DEFAULT_FOOD_SAFETY, aiQuota: { date: "", drafts: 0, voice: 0, licence: 0 }, createdAt: NOW,
  };
}

export function stock(id: string, merchantId: string, over: Partial<StockItem> = {}): StockItem {
  return {
    id, merchantId, name: "Butter croissant", nameEn: "Butter croissant", category: "bakery", vegMark: "egg", unit: "pc",
    usualPrice: 90, allergens: ["gluten", "dairy", "egg"], date: dayKey(NOW), preparedToday: 20, remaining: 12, lastUpdatedAt: NOW, ...over,
  };
}

export function ngo(id = "n1"): Ngo {
  return { id, name: "Roti Bank", serviceArea: { ...CENTER, radiusKm: 8 }, verification: { status: "verified" }, createdAt: NOW };
}

/** Fresh isolated store with one verified merchant, its staff, a customer, an NGO and an admin. */
export async function freshWorld() {
  const store = new MemoryStore();
  setStoreForTests(store);
  const m = merchant();
  const staff = user("staff", "merchant_staff", m.id);
  const customer = user("cust", "customer");
  const customer2 = user("cust2", "customer");
  const n = ngo();
  const ngoUser = user("ngouser", "ngo_member", n.id);
  const admin = user("admin", "admin");
  await store.set(C.merchants, m);
  await store.set(C.ngos, n);
  for (const u of [staff, customer, customer2, ngoUser, admin]) await store.set(C.users, u);
  const cro = stock("s_cro", m.id);
  const muf = stock("s_muf", m.id, { name: "Blueberry muffin", nameEn: "Blueberry muffin", usualPrice: 80, remaining: 8 });
  await store.set(C.stock, cro);
  await store.set(C.stock, muf);
  return { store, m, staff, customer, customer2, n, ngoUser, admin, cro, muf };
}
