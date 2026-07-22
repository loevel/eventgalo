"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface DirectoryFilters {
  q: string;
  sector: string;
  city: string;
  kind: string;
  verified: boolean;
}

interface OpportunityFilters {
  q: string;
  from: string;
  to: string;
}

/**
 * Barre de recherche en langage naturel : envoie la requête à un endpoint IA qui la
 * convertit en filtres structurés, puis navigue vers la même page avec ces filtres
 * en query params — la recherche déterministe existante (SQL) fait le reste.
 *
 * `variant` (et non une fonction de mapping) car ce composant est rendu depuis des
 * Server Components : seules des props sérialisables peuvent leur être passées.
 */
export function SmartSearch({
  variant,
  sectors,
  placeholder,
}: {
  variant: "directory" | "opportunities";
  /** Secteurs de l'annuaire, pour ancrer la classification IA — uniquement pour variant="directory". */
  sectors?: readonly string[];
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (variant === "directory") {
        const filters = await api<DirectoryFilters>("/api/public/companies/search-parse", {
          method: "POST",
          body: { query: q, sectors },
          auth: false,
        });
        if (filters.q) params.set("q", filters.q);
        if (filters.sector) params.set("sector", filters.sector);
        if (filters.city) params.set("city", filters.city);
        if (filters.kind) params.set("kind", filters.kind);
        if (filters.verified) params.set("verified", "1");
      } else {
        const filters = await api<OpportunityFilters>("/api/public/companies/opportunities/search-parse", {
          method: "POST",
          body: { query: q },
          auth: false,
        });
        if (filters.q) params.set("q", filters.q);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
      }
      router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="card"
      style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}
    >
      <Sparkles size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 200 }}
        disabled={busy}
      />
      <button type="submit" className="btn-sm btn-accent" disabled={busy || !query.trim()}>
        {busy ? <Loader2 size={14} className="spin" /> : "Rechercher avec l'IA"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "var(--err)", flexBasis: "100%" }}>{error}</span>
      )}
    </form>
  );
}
