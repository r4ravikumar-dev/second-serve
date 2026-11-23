import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const POST = route(async (req) => {
  const { locale } = await parseJson(req, z.object({ locale: z.enum(["en", "hi"]) }));
  const user = await getCurrentUser();
  if (user) await getStore().update(C.users, user.id, { locale });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ss_locale", locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return res;
});
