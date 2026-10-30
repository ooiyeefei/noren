import { jaJP } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { BIZ_UDPGothic, Geist_Mono, Shippori_Mincho_B1 } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";
import "../globals.css";

// BIZ UDPGothic: Morisawa's universal-design face, legible for older readers, Japanese and Latin in one family.
// Shippori Mincho B1: only for place names on the noren. Japanese glyphs load as unicode-range slices on demand.
const bizGothic = BIZ_UDPGothic({
  variable: "--font-biz",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});
const shippori = Shippori_Mincho_B1({
  variable: "--font-shippori",
  weight: ["700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Noren",
  description: "Stories about real places, told by the people who run them.",
  // FR-021: said in the page as well as in the X-Robots-Tag header.
  robots: { index: false, follow: false },
};

// Cache Components needs at least one value for every root param.
export async function generateStaticParams() {
  return getActiveRegion().locales.map((locale) => ({ lang: locale }));
}

// Clerk's sign-in widget in the Noren palette (kon ink, ai action, 10px controls, the site's font).
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#23305c",
    colorDanger: "#b7282e",
    fontFamily: "var(--font-biz), sans-serif",
    borderRadius: "10px",
  },
};

// Clerk's own UI strings; a language without an entry falls back to Clerk's English.
const CLERK_LOCALIZATION: Partial<Record<string, typeof jaJP>> = { ja: jaJP };

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const region = getActiveRegion();
  return (
    <html
      lang={locale}
      className={`${bizGothic.variable} ${shippori.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Clerk's docs: inside <body>, not around <html>, when Cache Components is on. */}
        <ClerkProvider
          signInUrl={`/${locale}/sign-in`}
          localization={CLERK_LOCALIZATION[locale]}
          appearance={CLERK_APPEARANCE}
        >
          <ConvexClientProvider>
            <SiteHeader
              locale={locale}
              regionName={region.name[locale] ?? region.id}
              locales={region.locales}
            />
            {children}
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
