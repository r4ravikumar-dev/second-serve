import { StockBoard } from "@/components/StockBoard";
import { VerifyFirst } from "@/components/VerifyFirst";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function MerchantHome() {
  const { verified } = await merchantContext();
  return verified ? <StockBoard /> : <VerifyFirst href="/merchant/profile" />;
}
