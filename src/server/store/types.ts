// Minimal document-store abstraction implemented by Firestore (production) and an
// in-memory store (local dev + tests). Keeps domain logic backend-agnostic.

export type Doc = { id: string };

export type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";
export interface Where { field: string; op: Op; value: unknown }

export interface QuerySpec {
  where?: Where[];
  orderBy?: { field: string; dir?: "asc" | "desc" };
  limit?: number;
}

export interface Tx {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  set<T extends Doc>(collection: string, doc: T): void;
  update(collection: string, id: string, patch: Record<string, unknown>): void;
  delete(collection: string, id: string): void;
}

export interface Store {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  set<T extends Doc>(collection: string, doc: T): Promise<void>;
  update(collection: string, id: string, patch: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  query<T extends Doc>(collection: string, spec?: QuerySpec): Promise<T[]>;
  /** Documents whose `location` lies within radiusKm of center (uses `geohash` + `location`). */
  nearby<T extends Doc>(collection: string, center: { lat: number; lng: number }, radiusKm: number, where?: Where[]): Promise<T[]>;
  /** Serializable read-then-write transaction. All reads must happen before writes. */
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

/** Dot-path read used by the memory store and filters ("verification.status"). */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export function matches(doc: Doc, where: Where[] = []): boolean {
  return where.every(({ field, op, value }) => {
    const v = getPath(doc, field) as never;
    switch (op) {
      case "==": return v === value;
      case "!=": return v !== value;
      case "<": return v < (value as never);
      case "<=": return v <= (value as never);
      case ">": return v > (value as never);
      case ">=": return v >= (value as never);
      case "in": return Array.isArray(value) && value.includes(v);
    }
  });
}
