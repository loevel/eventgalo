import type { MetadataRoute } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

// Regénéré à chaque requête pour refléter les événements publiés récemment
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: "https://eventgalo.com",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://eventgalo.com/sponsors",
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: "https://eventgalo.com/opportunites",
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: "https://eventgalo.com/cgu",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: "https://eventgalo.com/confidentialite",
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  try {
    const res = await fetch(`${API_BASE}/api/public/events`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { events: Array<{ public_slug: string; updated_at: string | null }> };
      for (const ev of data.events) {
        entries.push({
          url: `https://eventgalo.com/e/${ev.public_slug}`,
          ...(ev.updated_at ? { lastModified: new Date(ev.updated_at) } : {}),
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }
  } catch {
    // API indisponible : on sert au moins la page d'accueil
  }

  return entries;
}
