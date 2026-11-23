function pick<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = (process.env[name] ?? fallback) as T;
  if (!allowed.includes(v)) throw new Error(`${name} must be one of ${allowed.join(", ")} (got "${v}")`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  dataBackend: pick("DATA_BACKEND", ["memory", "firestore"] as const, "memory"),
  authMode: pick("AUTH_MODE", ["dev", "firebase"] as const, "dev"),
  aiMode: pick("AI_MODE", ["mock", "gemini"] as const, "mock"),
  blobMode: pick("BLOB_MODE", ["local", "gcs"] as const, "local"),
  project: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  geminiLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  geminiEscalationModel: process.env.GEMINI_ESCALATION_MODEL ?? "gemini-4-hydrogen",
  mediaBucket: process.env.MEDIA_BUCKET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  pickupHmacKey: process.env.PICKUP_HMAC_KEY ?? "",
  /** Service account allowed to call /api/cron/sweep (OIDC token email). */
  schedulerSa: process.env.SCHEDULER_SA ?? "",
  /** Public base URL of this service, used as the OIDC audience for the cron job. */
  publicUrl: process.env.PUBLIC_URL ?? "",
  timeZone: process.env.APP_TIME_ZONE ?? "Asia/Kolkata",
  limits: {
    draftsPerDay: 20,
    voicePerDay: 40,
    licencePerDay: 3,
    maxActiveReservations: 2,
    maxPickupAttempts: 5,
    photoMaxBytes: 5 * 1024 * 1024,
    audioMaxBytes: 2 * 1024 * 1024,
    docMaxBytes: 5 * 1024 * 1024,
    priceFloorRatio: 0.2,  // rescue price >= 20% of original
    priceCeilRatio: 0.9,   // rescue price <= 90% of original
  },
} as const;

/** Fail fast on unsafe production configuration. */
export function assertSafeConfig(): void {
  if (!config.isProd) return;
  if (config.authMode === "dev") throw new Error("AUTH_MODE=dev is not allowed in production");
  if (config.dataBackend === "memory") throw new Error("DATA_BACKEND=memory is not allowed in production");
  if (config.blobMode === "local") throw new Error("BLOB_MODE=local is not allowed in production");
  if (config.sessionSecret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  if (config.pickupHmacKey.length < 32) throw new Error("PICKUP_HMAC_KEY missing or too short");
}
