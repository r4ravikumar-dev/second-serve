import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, Noto_Sans_Devanagari } from "next/font/google";
import "@/styles/dna-tokens.css";
import "@/styles/app.css";
import { BottomNav } from "@/components/BottomNav";
import { LangToggle } from "@/components/LangToggle";
import { Providers } from "@/components/Providers";
import { SignOutButton } from "@/components/SignOutButton";
import { t } from "@/lib/i18n";
import { currentLocale, getCurrentUser } from "@/server/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600"], variable: "--font-bricolage", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-deva", display: "swap" });

export const metadata: Metadata = {
  title: "Second Serve",
  description: "Rescue surplus food from cafés and bakeries near you.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#714FFF" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, user] = await Promise.all([currentLocale(), getCurrentUser()]);
  return (
    <html lang={locale} className={`${inter.variable} ${bricolage.variable} ${deva.variable}`}>
      <body>
        <Providers locale={locale}>
          <div className="shell">
            <header className="header">
              <a href="/" className="brand t-mobile-display-sm">{t(locale, "appName")}</a>
              <span className="spacer" />
              <LangToggle />
              {user ? <SignOutButton name={user.displayName} /> : <a className="btn btn-secondary btn-sm t-mobile-label-lg-medium" href="/login">{t(locale, "signIn")}</a>}
            </header>
            <main className="main">{children}</main>
            {user && <BottomNav role={user.role} />}
          </div>
        </Providers>
      </body>
    </html>
  );
}
