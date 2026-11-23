"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/lib/client";
import type { MsgKey } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import { IconBag, IconBox, IconChart, IconHeart, IconShield, IconSpark, IconStore, IconTicket } from "./Icons";

const NAV: Record<Role, { href: string; key: MsgKey; Icon: (p: { className?: string }) => React.JSX.Element }[]> = {
  customer: [
    { href: "/offers", key: "navOffers", Icon: IconBag },
    { href: "/me", key: "navReservations", Icon: IconTicket },
  ],
  merchant_staff: [
    { href: "/merchant", key: "navStock", Icon: IconBox },
    { href: "/merchant/rescue", key: "navRescue", Icon: IconSpark },
    { href: "/merchant/counter", key: "navCounter", Icon: IconTicket },
    { href: "/merchant/dashboard", key: "navDashboard", Icon: IconChart },
    { href: "/merchant/profile", key: "navProfile", Icon: IconStore },
  ],
  ngo_member: [
    { href: "/ngo", key: "navDonations", Icon: IconHeart },
    { href: "/ngo/profile", key: "navProfile", Icon: IconStore },
  ],
  admin: [
    { href: "/admin", key: "navAdmin", Icon: IconShield },
    { href: "/offers", key: "navOffers", Icon: IconBag },
  ],
};

export function BottomNav({ role }: { role: Role }) {
  const path = usePathname();
  const { t } = useT();
  const items = NAV[role];
  const active = items.reduce((best, i) => (path === i.href || path.startsWith(i.href + "/")) && i.href.length > best.length ? i.href : best, "");
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(({ href, key, Icon }) => (
        <a key={href} href={href} aria-current={active === href ? "page" : undefined} className="t-mobile-label-sm-medium">
          <Icon className="icon" />
          {t(key)}
        </a>
      ))}
    </nav>
  );
}
