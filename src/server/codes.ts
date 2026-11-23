import crypto from "node:crypto";
import { config } from "./config";

// Unambiguous alphabet: no 0/O, 1/I/L.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const DEV_KEY = "dev-only-pickup-hmac-key-not-for-production";

export function generateCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function key(): string {
  if (config.pickupHmacKey) return config.pickupHmacKey;
  if (config.isProd) throw new Error("PICKUP_HMAC_KEY not configured");
  return DEV_KEY;
}

/** Hash bound to the record id so a code can't be replayed against another reservation. */
export function hashCode(recordId: string, code: string): string {
  return crypto.createHmac("sha256", key()).update(`${recordId}:${normalizeCode(code)}`).digest("hex");
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codeMatches(recordId: string, code: string, hash: string): boolean {
  const a = Buffer.from(hashCode(recordId, code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** QR payload = "<recordId>.<code>" so the counter can scan instead of typing. */
export function qrPayload(recordId: string, code: string): string {
  return `${recordId}.${code}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

/** AES-256-GCM so the owner can see their code again; a DB leak alone reveals nothing. */
function aesKey(): Buffer {
  return crypto.createHash("sha256").update(`enc:${key()}`).digest();
}

export function encryptCode(code: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([c.update(code, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptCode(blob: string | undefined): string | null {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", aesKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
