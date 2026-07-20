"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Banner {
  enabled: boolean;
  kind?: string;
  text?: string;
  link?: string | null;
}

export function SiteBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    api<Banner>("/api/public/settings/banner", { auth: false })
      .then(setBanner)
      .catch(() => setBanner(null));
  }, []);

  if (!banner?.enabled || !banner.text) return null;

  const content = <>{banner.text}</>;

  return (
    <div className={`site-banner site-banner-${banner.kind ?? "info"}`}>
      {banner.link ? (
        <a href={banner.link} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
