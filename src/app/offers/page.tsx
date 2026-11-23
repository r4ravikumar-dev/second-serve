import { LiveOffers } from "@/components/LiveOffers";
import { pageUser } from "@/server/guards";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  await pageUser(["customer", "admin"]);
  return <LiveOffers />;
}
