import { CreateOrg } from "@/components/Onboarding";
import { pageUser } from "@/server/guards";

export const dynamic = "force-dynamic";

/** A customer account registers a business or NGO (then uploads its licence). */
export default async function OnboardPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await pageUser(["customer"]);
  const { kind } = await searchParams;
  return <CreateOrg kind={kind === "ngo" ? "ngo" : "merchant"} />;
}
