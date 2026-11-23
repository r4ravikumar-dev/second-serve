import { AdminConsole } from "@/components/AdminConsole";
import { pageUser } from "@/server/guards";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await pageUser(["admin"]);
  return <AdminConsole />;
}
