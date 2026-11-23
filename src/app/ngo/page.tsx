import { NgoBoard } from "@/components/NgoBoard";
import { VerifyFirst } from "@/components/VerifyFirst";
import { ngoContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function NgoPage() {
  const { verified } = await ngoContext();
  return verified ? <NgoBoard /> : <VerifyFirst href="/ngo/profile" />;
}
