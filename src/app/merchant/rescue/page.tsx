import { RescueCapture } from "@/components/RescueCapture";
import { VerifyFirst } from "@/components/VerifyFirst";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function RescuePage() {
  const { verified } = await merchantContext();
  return verified ? <RescueCapture /> : <VerifyFirst href="/merchant/profile" />;
}
