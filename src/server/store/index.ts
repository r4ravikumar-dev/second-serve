import path from "node:path";
import { config } from "../config";
import { FirestoreStore } from "./firestore";
import { MemoryStore } from "./memory";
import type { Store } from "./types";

export * from "./types";

// Collection names in one place.
export const C = {
  users: "users",
  merchants: "merchants",
  ngos: "ngos",
  stock: "stock",
  salesDaily: "salesDaily",
  drafts: "surplusDrafts",
  offers: "offers",
  publicOffers: "publicOffers",
  reservations: "reservations",
  donations: "donations",
  impact: "impact",
  rateLimits: "rateLimits",
} as const;

const g = globalThis as unknown as { __ssStore?: Store };

/** Singleton store (survives Next.js dev hot-reload via globalThis). */
export function getStore(): Store {
  if (!g.__ssStore) {
    g.__ssStore = config.dataBackend === "firestore"
      ? new FirestoreStore(config.project)
      : new MemoryStore(process.env.MEMORY_STORE_FILE ?? path.join(process.cwd(), ".data", "dev-db.json"));
  }
  return g.__ssStore;
}

/** Tests inject a fresh store. */
export function setStoreForTests(store: Store): void {
  g.__ssStore = store;
}
