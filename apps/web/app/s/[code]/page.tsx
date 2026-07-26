"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, formatDate } from "@/lib/api";
import { CheckoutForm } from "@/components/checkout-form";

export default function SellerPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState<"vendre" | "stats">("vendre");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/public/seller/${code}`, { auth: false })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [code]);

  useEffect(() => {
    if (tab === "stats") {
      api(`/api/public/seller/${code}/stats`, { auth: false })
        .then(setStats)
        .catch((e) => setError(e.message));
    }
  }, [tab, code]);

  if (error) return <main className="container narrow"><div className="alert err">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const ev = data.event;
  // Un vendeur ne peut vendre que les catégories où il a un quota
  const sellable = (data.categories as any[]).filter((c) => c.quota != null);

  return (
    <main className="container narrow">
      <h1>{ev.title}</h1>
      <p className="muted">
        {formatDate(ev.starts_at)} · Vente par <strong>{data.seller.name}</strong>
      </p>

      <div className="tabs">
        <button className={tab === "vendre" ? "active" : ""} onClick={() => setTab("vendre")}>
          Vendre un billet
        </button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
          Mes ventes
        </button>
      </div>

      {tab === "vendre" && (
        <div className="card">
          {sellable.length ? (
            <CheckoutForm slug={ev.public_slug} categories={sellable} sellerCode={code} />
          ) : (
            <p className="muted">Aucun quota de vente ne vous a été assigné.</p>
          )}
        </div>
      )}

      {tab === "stats" && (
        <>
          {!stats && <p className="muted">Chargement…</p>}
          {stats && (
            <>
              <div className="grid2">
                {(stats.quotas as any[]).map((q, i) => (
                  <div className="card stat" key={i}>
                    <div className="num">
                      {q.sold}/{q.quota}
                    </div>
                    <div className="lbl">{q.category_name} vendus</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ overflowX: "auto" }}>
                <h3 style={{ marginTop: 0 }}>Mes billets vendus</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Billet</th>
                      <th>Acheteur</th>
                      <th>Catégorie</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.sales as any[]).map((s) => (
                      <tr key={s.serial}>
                        <td className="serial" style={{ fontSize: 13 }}>{s.serial}</td>
                        <td>{s.buyer_name}</td>
                        <td>{s.category_name}</td>
                        <td>
                          <span className={`badge ${s.status === "valid" ? "ok" : s.status === "used" ? "mut" : "err"}`}>
                            {s.status === "valid" ? "Valide" : s.status === "used" ? "Utilisé" : "Remboursé"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
