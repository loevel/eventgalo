import { Search } from "lucide-react";

/**
 * Barre de filtres horizontale partagée par les annuaires (/sponsors, /prestataires).
 * Simple form GET, pas d'état client nécessaire.
 */
export function DirectoryFilters({
  sectors,
  q,
  sector,
  city,
  searchPlaceholder = "Nom, mots-clés…",
  chipSectors,
  extra,
}: {
  sectors: readonly string[];
  q: string;
  sector: string;
  city: string;
  searchPlaceholder?: string;
  /** Sous-ensemble de secteurs affiché en pilules rapides sous la barre. */
  chipSectors?: readonly string[];
  /** Champs additionnels spécifiques à une page (ex. type de profil, vérifiés uniquement). */
  extra?: React.ReactNode;
}) {
  return (
    <form className="card directory-filters-bar" method="GET">
      <div className="directory-filters-row">
        <div>
          <label htmlFor="q">Recherche</label>
          <input id="q" name="q" defaultValue={q} placeholder={searchPlaceholder} />
        </div>
        <div>
          <label htmlFor="sector">Catégorie</label>
          <select id="sector" name="sector" defaultValue={sector}>
            <option value="">Toutes les catégories</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="city">Ville / région</label>
          <input id="city" name="city" defaultValue={city} placeholder="Montréal" />
        </div>
        <button type="submit" className="btn-accent directory-filters-submit">
          <Search size={15} /> Rechercher
        </button>
      </div>
      {extra}
      {chipSectors && chipSectors.length > 0 && (
        <div className="directory-chips">
          {chipSectors.map((s) => {
            const active = sector === s;
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (city) params.set("city", city);
            if (!active) params.set("sector", s);
            const href = params.toString() ? `?${params.toString()}` : ".";
            return (
              <a key={s} href={href} className={`directory-chip${active ? " active" : ""}`}>
                {s}
                {active && <span className="directory-chip-x">✕</span>}
              </a>
            );
          })}
        </div>
      )}
    </form>
  );
}
