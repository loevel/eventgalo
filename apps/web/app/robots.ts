import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/auth/",
        "/scan",
        "/checkout/",
        "/t/", // billets individuels
        "/i/", // invitations personnelles
        "/s/", // liens vendeurs
      ],
    },
    sitemap: "https://eventgalo.com/sitemap.xml",
  };
}
