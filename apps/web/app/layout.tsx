import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { TopbarNav } from "@/components/topbar-nav";
import "./globals.css";

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
  ],
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "EventGalo",
    locale: "fr_CA",
    title: "EventGalo — événements, invitations et billetterie",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "EventGalo — événements, invitations et billetterie",
    description: SITE_DESCRIPTION,
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
  themeColor: "#b4540a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="topbar">
          <Link href="/" className="brand">
            Event<span>Galo</span>
          </Link>
          <TopbarNav />
        </div>
        {children}
      </body>
    </html>
  );
}
