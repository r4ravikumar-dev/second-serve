import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { currentLocale, getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guards";

export default async function Home() {
  const [user, locale] = await Promise.all([getCurrentUser(), currentLocale()]);
  if (user) redirect(homeFor(user.role));
  return (
    <div className="stack-lg">
      <section className="hero stack">
        <span className="t-mobile-overline-sm">{t(locale, "tagline")}</span>
        <h1 className="t-mobile-display-lg" style={{ margin: 0 }}>{t(locale, "heroTitle")}</h1>
        <p className="t-mobile-body-lg-regular" style={{ margin: 0 }}>{t(locale, "heroBody")}</p>
        <a className="btn btn-secondary t-mobile-label-xl-medium" href="/login">{t(locale, "signIn")}</a>
      </section>
      <section className="grid-2">
        {(["navOffers", "navRescue", "navDonations", "navDashboard"] as const).map((k) => (
          <div key={k} className="card card-tight t-mobile-heading-sm">{t(locale, k)}</div>
        ))}
      </section>
    </div>
  );
}
