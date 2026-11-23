import { Counter } from "@/components/Counter";
import { VerifyFirst } from "@/components/VerifyFirst";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function CounterPage() {
  const { verified } = await merchantContext();
  return verified ? <Counter /> : <VerifyFirst href="/merchant/profile" />;
}
