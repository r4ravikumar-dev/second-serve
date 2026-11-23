import { requireUser } from "@/server/auth";
import { createNgo, ngoSchema } from "@/server/domain/onboarding";
import { parseJson, route } from "@/server/http";

export const POST = route(async (req) => {
  const user = await requireUser(["customer"]);
  return createNgo(user, await parseJson(req, ngoSchema));
});
