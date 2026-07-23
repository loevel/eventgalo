import { ChevronLeft, ChevronRight } from "lucide-react";

/** Construit l'URL d'une page donnée, en conservant les autres filtres (query params) déjà présents. */
function pageHref(basePath: string, params: Record<string, string>, page: number): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  if (page > 1) usp.set("page", String(page));
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Numéros de page à afficher : bornes + fenêtre autour de la page courante, avec "…" pour les trous. */
function pageNumbers(page: number, totalPages: number): Array<number | "…"> {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Pagination serveur (liens `<a>` classiques) — conserve les filtres actifs dans l'URL. */
export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <a
        href={pageHref(basePath, params, page - 1)}
        className={`btn-sm btn-ghost pagination-nav${page <= 1 ? " disabled" : ""}`}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
      >
        <ChevronLeft size={14} /> Précédent
      </a>
      <div className="pagination-pages">
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
          ) : (
            <a
              key={p}
              href={pageHref(basePath, params, p)}
              className={`pagination-page${p === page ? " active" : ""}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </a>
          ),
        )}
      </div>
      <a
        href={pageHref(basePath, params, page + 1)}
        className={`btn-sm btn-ghost pagination-nav${page >= totalPages ? " disabled" : ""}`}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
      >
        Suivant <ChevronRight size={14} />
      </a>
    </nav>
  );
}
