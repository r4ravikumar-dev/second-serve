"use client";

import { createContext, useContext } from "react";
import { t as translate, type MsgKey } from "./i18n";
import type { Locale } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** JSON fetch against our own API (same-origin cookie auth). */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Ask the server for an upload target, then PUT the file there. Returns the object path. */
export async function uploadFile(file: Blob, kind: "photo" | "audio" | "licence"): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const target = await api<{ path: string; url: string; headers: Record<string, string> }>("/api/uploads", {
    body: { kind, contentType, size: file.size },
  });
  const put = await fetch(target.url, { method: "PUT", headers: target.headers, body: file, credentials: "same-origin" });
  if (!put.ok) throw new ApiError(put.status, "upload_failed", "Upload failed");
  return target.path;
}

export const LocaleContext = createContext<Locale>("en");

export function useT() {
  const locale = useContext(LocaleContext);
  return { locale, t: (key: MsgKey, vars?: Record<string, string | number>) => translate(locale, key, vars) };
}

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function time(ts: number, locale: Locale): string {
  return new Date(ts).toLocaleTimeString(locale === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function toLocalInput(ts: number): string {
  // value for <input type="datetime-local"> in IST
  const d = new Date(ts + 330 * 60_000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): number {
  return new Date(`${v}:00+05:30`).getTime();
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DEMO_CENTER = { lat: 12.9352, lng: 77.6245 };
