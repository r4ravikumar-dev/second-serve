import { z } from "zod";
import type { Reservation } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { decryptCode, qrPayload } from "@/server/codes";
import { reserve } from "@/server/domain/reservations";
import { parseJson, route } from "@/server/http";
import { C, getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const user = await requireUser(["customer"]);
  const { offerId, qty } = await parseJson(req, z.object({ offerId: z.string().min(1).max(64), qty: z.number().int().min(1).max(3) }));
  return reserve(user, offerId, qty);
});

export const GET = route(async () => {
  const user = await requireUser(["customer"]);
  const rows = await getStore().query<Reservation & { id: string }>(C.reservations, { where: [{ field: "customerUid", op: "==", value: user.id }], limit: 50 });
  return rows.sort((a, b) => b.createdAt - a.createdAt).map(({ codeHash: _c, codeEnc, ...r }) => {
    const code = r.status === "reserved" ? decryptCode(codeEnc) : null;
    return { ...r, code, qr: code ? qrPayload(r.id, code) : null };
  });
});
