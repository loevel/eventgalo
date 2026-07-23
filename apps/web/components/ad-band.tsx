"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

interface AdSlot {
  id: string;
  title: string;
  link_url: string;
}

/**
 * Bandeau publicitaire de la homepage : fetch côté client (pas SSR) pour que la
 * requête vers l'API porte la vraie IP du visiteur — c'est ce qui permet à
 * `request.cf.region` côté Worker de cibler la bonne région.
 */
export function AdBand() {
  const [ads, setAds] = useState<AdSlot[] | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/ads`)
      .then((r) => (r.ok ? r.json() : { ads: [] }))
      .then((data: { ads?: AdSlot[] }) => setAds(data.ads ?? []))
      .catch(() => setAds([]));
  }, []);

  if (!ads || ads.length === 0) return null;

  const loop = [...ads, ...ads];

  return (
    <div className="ad-band">
      <span className="ad-band-label">Partenaires</span>
      <div className="ad-marquee">
        <div className="ad-track">
          {loop.map((ad, i) => (
            <a
              key={`${ad.id}-${i}`}
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="ad-card"
              aria-hidden={i >= ads.length}
              tabIndex={i >= ads.length ? -1 : 0}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- créative externe légère, next/image superflu */}
              <img src={`${API_BASE}/api/public/ads/${ad.id}/image?thumb=1`} alt={ad.title} loading="lazy" />
              <span className="ad-card-title">{ad.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
