"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";

/** Résumé IA des avis d'une entreprise — chargé au montage, silencieux si pas assez d'avis. */
export function CompanyReviewSummary({ companyId }: { companyId: string }) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ summary: string | null }>(`/api/public/companies/${companyId}/review-summary`, { auth: false })
      .then((res) => {
        if (!cancelled) setSummary(res.summary);
      })
      .catch(() => {
        // Silencieux : le résumé est un bonus, pas une donnée critique de la page.
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!summary) return null;

  return (
    <p className="muted" style={{ marginTop: 6, fontSize: 13, display: "flex", gap: 6, alignItems: "flex-start" }}>
      <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent)" }} />
      <span>{summary}</span>
    </p>
  );
}
