import { config } from "../config";

// All business-day logic runs in the app time zone (Asia/Kolkata by default).

function parts(ts: number, tz = config.timeZone) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd };
}

export function dayKey(ts: number): string {
  const { y, m, d } = parts(ts);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function monthKey(ts: number): string {
  return dayKey(ts).slice(0, 7);
}

export function hourOf(ts: number): number { return parts(ts).h; }
export function weekdayOf(ts: number): number { return parts(ts).wd; }
export function minutesOfDay(ts: number): number { const p = parts(ts); return p.h * 60 + p.min; }

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Epoch ms for HH:MM on the same business day as `ts`. */
export function atTimeOfDay(ts: number, hhmm: string): number {
  return ts + (hhmmToMinutes(hhmm) - minutesOfDay(ts)) * 60_000 - (ts % 60_000);
}

export function daysAgoKey(ts: number, days: number): string {
  return dayKey(ts - days * 86_400_000);
}
