import fs from "node:fs";
import path from "node:path";
import { distanceKm } from "../geo";
import { type Doc, type QuerySpec, type Store, type Tx, type Where, getPath, matches } from "./types";

type Data = Record<string, Record<string, Doc>>;

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory store for local development and tests. Transactions are serialized
 * with a promise-chain mutex, so read-modify-write is safe. Optionally persists
 * to a JSON file so dev data survives restarts.
 */
export class MemoryStore implements Store {
  private data: Data = {};
  private lock: Promise<unknown> = Promise.resolve();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file?: string) {
    if (file && fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, "utf8")) as Data; } catch { this.data = {}; }
    }
  }

  isEmpty(): boolean { return Object.keys(this.data).length === 0; }

  private col(name: string): Record<string, Doc> {
    return (this.data[name] ??= {});
  }

  private persist(): void {
    if (!this.file) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      fs.mkdirSync(path.dirname(this.file!), { recursive: true });
      fs.writeFileSync(this.file!, JSON.stringify(this.data));
    }, 200);
  }

  private withLock<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  async get<T extends Doc>(collection: string, id: string): Promise<T | null> {
    const d = this.col(collection)[id];
    return d ? (clone(d) as T) : null;
  }

  async set<T extends Doc>(collection: string, doc: T): Promise<void> {
    await this.withLock(async () => { this.col(collection)[doc.id] = clone(doc); });
    this.persist();
  }

  async update(collection: string, id: string, patch: Record<string, unknown>): Promise<void> {
    await this.withLock(async () => this.applyUpdate(collection, id, patch));
    this.persist();
  }

  private applyUpdate(collection: string, id: string, patch: Record<string, unknown>): void {
    const existing = this.col(collection)[id];
    if (!existing) throw new Error(`update: ${collection}/${id} not found`);
    const next = clone(existing) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      // support dot paths like "verification.status"
      const parts = k.split(".");
      let target = next;
      for (const p of parts.slice(0, -1)) {
        target[p] = typeof target[p] === "object" && target[p] !== null ? target[p] : {};
        target = target[p] as Record<string, unknown>;
      }
      target[parts[parts.length - 1]] = clone(v);
    }
    this.col(collection)[id] = next as Doc;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.withLock(async () => { delete this.col(collection)[id]; });
    this.persist();
  }

  async query<T extends Doc>(collection: string, spec: QuerySpec = {}): Promise<T[]> {
    let rows = Object.values(this.col(collection)).filter((d) => matches(d, spec.where));
    if (spec.orderBy) {
      const { field, dir = "asc" } = spec.orderBy;
      rows = rows.sort((a, b) => {
        const av = getPath(a, field) as never, bv = getPath(b, field) as never;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === "asc" ? 1 : -1);
      });
    }
    if (spec.limit) rows = rows.slice(0, spec.limit);
    return clone(rows) as T[];
  }

  async nearby<T extends Doc>(collection: string, center: { lat: number; lng: number }, radiusKm: number, where?: Where[]): Promise<T[]> {
    return (await this.query<T>(collection, { where })).filter((d) => {
      const loc = (d as unknown as { location?: { lat: number; lng: number } }).location;
      return loc ? distanceKm(center, loc) <= radiusKm : false;
    });
  }

  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    return this.withLock(async () => {
      const writes: (() => void)[] = [];
      const tx: Tx = {
        get: async <T extends Doc>(c: string, id: string) => {
          const d = this.col(c)[id];
          return d ? (clone(d) as T) : null;
        },
        set: (c, doc) => { writes.push(() => { this.col(c)[doc.id] = clone(doc); }); },
        update: (c, id, patch) => { writes.push(() => this.applyUpdate(c, id, patch)); },
        delete: (c, id) => { writes.push(() => { delete this.col(c)[id]; }); },
      };
      const result = await fn(tx);
      writes.forEach((w) => w()); // commit atomically (single-threaded, under lock)
      this.persist();
      return result;
    });
  }
}
