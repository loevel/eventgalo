import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/auth/",
        "/scan",
        "/checkout/",
        "/t/", // billets individuels
        "/i/", // invitations personnelles
        "/s/", // liens vendeurs
        "/sp/", // liens sponsors privés
        "/entreprise", // espace entreprise authentifié (profil, demandes)
      ],
    },
    sitemap: "https://eventgalo.com/sitemap.xml",
  };
}
