import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/LoginPanel";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guards";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <LoginPanel mode={process.env.AUTH_MODE === "firebase" ? "firebase" : "dev"} />;
}
