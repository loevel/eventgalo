"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Barre de recherche en langage naturel : envoie la requête à un endpoint IA qui la
 * convertit en filtres structurés, puis navigue vers la même page avec ces filtres
 * en query params — la recherche déterministe existante (SQL) fait le reste.
 */
export function SmartSearch<T extends Record<string, unknown>>({
  endpoint,
  body,
  toParams,
  placeholder,
}: {
  endpoint: string;
  body?: Record<string, unknown>;
  toParams: (filters: T) => URLSearchParams;
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
      const filters = await api<T>(endpoint, { method: "POST", body: { query: q, ...body }, auth: false });
      const params = toParams(filters);
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
