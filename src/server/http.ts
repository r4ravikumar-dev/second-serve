import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const bad = (code: string, msg?: string) => new HttpError(400, code, msg);
export const unauthorized = () => new HttpError(401, "unauthorized", "Sign in required");
export const forbidden = (msg = "Not allowed") => new HttpError(403, "forbidden", msg);
export const notFound = (what = "Not found") => new HttpError(404, "not_found", what);
export const conflict = (code: string, msg?: string) => new HttpError(409, code, msg);
export const tooMany = (msg = "Too many requests") => new HttpError(429, "rate_limited", msg);

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response | unknown>;

/**
 * Wraps a route handler: JSON responses, consistent error shape, same-origin
 * check for state-changing requests (cookie auth => CSRF protection).
 */
export function route<Ctx = unknown>(fn: Handler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "invalid_input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      // Error Reporting picks this up (ReportedErrorEvent type + stack in message).
      console.error(JSON.stringify({
        severity: "ERROR",
        "@type": "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
        event: "unhandled",
        message: (err as Error)?.stack ?? String(err),
        context: { httpRequest: { method: req.method, url: req.nextUrl.pathname } },
        serviceContext: { service: "second-serve" },
      }));
      return NextResponse.json({ error: "internal", message: "Something went wrong" }, { status: 500 });
    }
  };
}

function assertSameOrigin(req: NextRequest): void {
  // Cron calls come from Cloud Scheduler with an OIDC bearer token and no Origin.
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return;
  const origin = req.headers.get("origin");
  if (!origin) throw forbidden("Missing Origin header");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw forbidden("Cross-origin request blocked");
}

const MAX_JSON_BYTES = 256 * 1024;

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large");
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw bad("invalid_json", "Body must be JSON");
  }
  return schema.parse(body);
}
