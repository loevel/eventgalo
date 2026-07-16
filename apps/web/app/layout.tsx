import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { TopbarNav } from "@/components/topbar-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "EventGalo — événements, invitations et billetterie",
  description:
    "Créez votre événement, partagez des invitations personnalisées, vendez des billets sécurisés avec suivi par vendeur.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#b4540a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
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
