import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { geohashQueryBounds } from "geofire-common";
import { distanceKm } from "../geo";
import { type Doc, type QuerySpec, type Store, type Tx, type Where, matches } from "./types";

/** Firestore implementation (production). Uses Application Default Credentials. */
export class FirestoreStore implements Store {
  private db: Firestore;

  constructor(projectId: string) {
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
    this.db = getFirestore(app);
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  private ref(collection: string, id: string) {
    return this.db.collection(collection).doc(id);
  }

  async get<T extends Doc>(collection: string, id: string): Promise<T | null> {
    const snap = await this.ref(collection, id).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
  }

  async set<T extends Doc>(collection: string, doc: T): Promise<void> {
    await this.ref(collection, doc.id).set(doc);
  }

  async update(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    await this.ref(collection, id).update(patch);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.ref(collection, id).delete();
  }

  private build(collection: string, spec: QuerySpec = {}): Query {
    let q: Query = this.db.collection(collection);
    for (const w of spec.where ?? []) q = q.where(w.field, w.op, w.value);
    if (spec.orderBy) q = q.orderBy(spec.orderBy.field, spec.orderBy.dir ?? "asc");
    if (spec.limit) q = q.limit(spec.limit);
    return q;
  }

  async query<T extends Doc>(collection: string, spec?: QuerySpec): Promise<T[]> {
    const snap = await this.build(collection, spec).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  async nearby<T extends Doc>(collection: string, center: { lat: number; lng: number }, radiusKm: number, where: Where[] = []): Promise<T[]> {
    // Geohash range queries, then exact distance + remaining filters in memory.
    const bounds = geohashQueryBounds([center.lat, center.lng], radiusKm * 1000);
    const equality = where.filter((w) => w.op === "==");
    const snaps = await Promise.all(bounds.map(([start, end]) => {
      let q: Query = this.db.collection(collection);
      for (const w of equality) q = q.where(w.field, "==", w.value);
      return q.orderBy("geohash").startAt(start).endAt(end).limit(200).get();
    }));
    const seen = new Set<string>();
    const out: T[] = [];
    for (const snap of snaps) for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const doc = { id: d.id, ...d.data() } as T;
      const loc = (doc as unknown as { location?: { lat: number; lng: number } }).location;
      if (loc && distanceKm(center, loc) <= radiusKm && matches(doc, where)) out.push(doc);
    }
    return out;
  }

  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (t) => {
      const tx: Tx = {
        get: async <T extends Doc>(c: string, id: string) => {
          const snap = await t.get(this.ref(c, id));
          return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
        },
        set: (c, doc) => { t.set(this.ref(c, doc.id), doc); },
        update: (c, id, patch) => { t.update(this.ref(c, id), patch); },
        delete: (c, id) => { t.delete(this.ref(c, id)); },
      };
      return fn(tx);
    });
  }
}
