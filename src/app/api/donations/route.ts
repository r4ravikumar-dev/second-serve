import { getCurrentUser, requireMerchant, requireNgo } from "@/server/auth";
import { donationsForMerchant, donationsForNgo } from "@/server/domain/donations";
import { unauthorized, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (user.role === "ngo_member") {
    const { ngo } = await requireNgo();
    return { ngo: { name: ngo.name, serviceArea: ngo.serviceArea }, ...(await donationsForNgo(ngo)) };
  }
  const { merchant } = await requireMerchant();
  return { mine: await donationsForMerchant(merchant.id) };
});
