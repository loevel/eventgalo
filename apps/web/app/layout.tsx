import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import Link from "next/link";
import { TopbarNav } from "@/components/topbar-nav";
import { SiteBanner } from "@/components/site-banner";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = "https://eventgalo.com";
const SITE_DESCRIPTION =
  "Créez votre événement, partagez des invitations personnalisées avec RSVP en un clic, vendez des billets sécurisés avec suivi par vendeur — anniversaires, galas, soirées communautaires.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EventGalo — événements, invitations et billetterie",
    template: "%s | EventGalo",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "billetterie en ligne",
    "invitations événement",
    "RSVP",
    "gala",
    "anniversaire",
    "vente de billets",
    "QR code billet",
    "gestion d'événements",
    "gala camerounais",
    "gala bamiléké",
    "association culturelle camerounaise",
    "communauté camerounaise Canada",
    "événements diaspora africaine",
  ],
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "EventGalo",
    locale: "fr_CA",
    title: "EventGalo — événements, invitations et billetterie",
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EventGalo — événements, invitations et billetterie",
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "EventGalo",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "EventGalo",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "fr",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#8f4009",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${instrumentSans.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SiteBanner />
        <div className="topbar">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fixe et léger, next/image est superflu ici */}
            <img src="/icon.svg" alt="" width={22} height={22} className="brand-mark" />
            Event<span>Galo</span>
          </Link>
          <TopbarNav />
        </div>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
