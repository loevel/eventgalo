"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

interface Facet {
  value: string;
  n: number;
}

/**
 * Filtres de l'annuaire des événements. L'état vit dans l'URL et non dans le
 * composant : un filtre posé reste partageable, indexable et récupérable au
 * retour arrière — ce qui compte pour une page dont le rôle est justement de
 * faire circuler les visiteurs.
 */
export function DiscoverFilters({ tags, cities }: { tags: Facet[]; cities: Facet[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const tag = params.get("tag") ?? "";
  const city = params.get("city") ?? "";
  const free = params.get("free") === "1";
  const hasFilters = Boolean(q || tag || city || free);

  // Le champ texte se resynchronise si la navigation change l'URL (retour arrière,
  // clic sur « tout effacer »).
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Tout changement de filtre renvoie à la première page : rester en page 4
    // d'un jeu de résultats qui n'en compte plus qu'une afficherait du vide.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/evenements?${qs}` : "/evenements");
  }

  return (
    <section className="discover-filters" aria-label="Filtrer les événements">
      <form
        className="discover-search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: q.trim() || null });
        }}
        role="search"
      >
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titre, lieu, mot-clé…"
          aria-label="Rechercher un événement"
        />
        <button type="submit" className="btn-sm btn-accent">
          Rechercher
        </button>
      </form>

      {tags.length > 0 && (
        <div className="chip-row" role="group" aria-label="Communauté">
          {tags.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`chip ${tag === t.value ? "is-on" : ""}`}
              aria-pressed={tag === t.value}
              onClick={() => apply({ tag: tag === t.value ? null : t.value })}
            >
              {t.value} <span className="chip-n">{t.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chip-row">
        {cities.slice(0, 8).map((ci) => (
          <button
            key={ci.value}
            type="button"
            className={`chip ${city === ci.value ? "is-on" : ""}`}
            aria-pressed={city === ci.value}
            onClick={() => apply({ city: city === ci.value ? null : ci.value })}
          >
            {ci.value}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${free ? "is-on" : ""}`}
          aria-pressed={free}
          onClick={() => apply({ free: free ? null : "1" })}
        >
          Gratuit
        </button>
        {hasFilters && (
          <button type="button" className="chip chip-clear" onClick={() => router.push("/evenements")}>
            <X size={13} aria-hidden="true" /> Tout effacer
          </button>
        )}
      </div>
    </section>
  );
}
