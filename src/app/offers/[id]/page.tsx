import { OfferDetail } from "@/components/OfferDetail";
import { pageUser } from "@/server/guards";

export const dynamic = "force-dynamic";

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser(["customer", "admin"]);
  const { id } = await params;
  return <OfferDetail id={id} />;
}
