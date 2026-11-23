import { redirect } from "next/navigation";
import type { Role, User } from "@/lib/types";
import { getCurrentUser } from "./auth";

/** Server-component guard: sends users to sign-in or their own home. */
export async function pageUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function homeFor(role: Role): string {
  return { customer: "/offers", merchant_staff: "/merchant", ngo_member: "/ngo", admin: "/admin" }[role];
}
