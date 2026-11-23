import { Dashboard } from "@/components/Dashboard";
import { VerifyFirst } from "@/components/VerifyFirst";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { verified } = await merchantContext();
  return verified ? <Dashboard /> : <VerifyFirst href="/merchant/profile" />;
}
