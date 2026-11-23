import { FoodSafetySettings, VerificationPanel } from "@/components/Onboarding";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function MerchantProfile() {
  const { merchant } = await merchantContext();
  if (!merchant) return null;
  return (
    <div className="stack-lg">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{merchant.name}</h1>
      <VerificationPanel kind="merchant" verification={merchant.verification} />
      <FoodSafetySettings initial={merchant.foodSafety} />
    </div>
  );
}
