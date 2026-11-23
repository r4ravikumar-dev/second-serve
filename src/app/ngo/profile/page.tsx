import { VerificationPanel } from "@/components/Onboarding";
import { ngoContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function NgoProfile() {
  const { ngo } = await ngoContext();
  if (!ngo) return null;
  return (
    <div className="stack-lg">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{ngo.name}</h1>
      <VerificationPanel kind="ngo" verification={ngo.verification} />
    </div>
  );
}
