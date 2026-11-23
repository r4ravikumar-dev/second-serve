import { requireUser } from "@/server/auth";
import { cancelReservation } from "@/server/domain/reservations";
import { route } from "@/server/http";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireUser(["customer"]);
  const { id } = await params;
  await cancelReservation(user, id);
  return { ok: true };
});
