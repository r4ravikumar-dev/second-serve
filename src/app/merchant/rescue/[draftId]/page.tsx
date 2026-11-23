import { DraftReview } from "@/components/DraftReview";
import { merchantContext } from "@/server/merchantPage";

export const dynamic = "force-dynamic";

export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { merchant } = await merchantContext();
  const { draftId } = await params;
  return <DraftReview draftId={draftId} closeHhmm={merchant?.pickupHours.close ?? "22:00"} />;
}
