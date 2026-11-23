import fs from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { config } from "./config";
import { bad } from "./http";

export type UploadKind = "photo" | "audio" | "licence";

const ALLOWED: Record<UploadKind, { types: string[]; maxBytes: number }> = {
  photo: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: config.limits.photoMaxBytes },
  audio: { types: ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac"], maxBytes: config.limits.audioMaxBytes },
  licence: { types: ["image/jpeg", "image/png", "image/webp", "application/pdf"], maxBytes: config.limits.docMaxBytes },
};

export function validateUpload(kind: UploadKind, contentType: string, size: number): void {
  const rule = ALLOWED[kind];
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (!rule.types.includes(base)) throw bad("unsupported_type", `Allowed: ${rule.types.join(", ")}`);
  if (!Number.isFinite(size) || size <= 0 || size > rule.maxBytes) throw bad("too_large", `Max ${Math.round(rule.maxBytes / 1024 / 1024)} MB`);
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");
let storage: Storage | null = null;
const gcs = () => (storage ??= new Storage());

/** Object path is server-chosen; clients never pick paths. */
export function objectPath(ownerId: string, kind: UploadKind, id: string): string {
  return `${kind}/${ownerId}/${id}`;
}

/** Returns where the browser should PUT the file. */
export async function createUploadTarget(objPath: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }> {
  if (config.blobMode === "local") {
    return { url: `/api/uploads/local?path=${encodeURIComponent(objPath)}`, headers: { "Content-Type": contentType } };
  }
  const [url] = await gcs().bucket(config.mediaBucket).file(objPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  });
  return { url, headers: { "Content-Type": contentType } };
}

export async function writeLocal(objPath: string, data: Buffer): Promise<void> {
  if (config.blobMode !== "local") throw new Error("local blob writes disabled");
  const full = safeLocalPath(objPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

function safeLocalPath(objPath: string): string {
  const full = path.join(LOCAL_DIR, objPath);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw bad("invalid_path");
  return full;
}

/** Reads an uploaded object (for sending to Gemini). Enforces size cap. */
export async function readObject(objPath: string, maxBytes: number): Promise<Buffer> {
  if (config.blobMode === "local") {
    const buf = await fs.readFile(safeLocalPath(objPath));
    if (buf.length > maxBytes) throw bad("too_large");
    return buf;
  }
  const file = gcs().bucket(config.mediaBucket).file(objPath);
  const [meta] = await file.getMetadata();
  if (Number(meta.size ?? 0) > maxBytes) throw bad("too_large");
  const [buf] = await file.download();
  return buf;
}

export function gcsUri(objPath: string): string | null {
  return config.blobMode === "gcs" ? `gs://${config.mediaBucket}/${objPath}` : null;
}
