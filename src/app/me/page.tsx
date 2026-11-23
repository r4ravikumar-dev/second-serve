import { MyReservations } from "@/components/MyReservations";
import { pageUser } from "@/server/guards";

export const dynamic = "force-dynamic";

export default async function MePage() {
  await pageUser(["customer"]);
  return <MyReservations />;
}
