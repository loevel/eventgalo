"use client";

import { useEffect, useState } from "react";
import { api, formatPrice } from "@/lib/api";

interface Overview {
  events: { total: number; published: number; this_month: number };
  users: { total: number; suspended: number };
  companies: { total: number };
  sales: { paid_transactions: number; gmv_cents: number; platform_fees_cents: number; tickets_sold: number };
  connect: { accounts_started: number; accounts_enabled: number };
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/api/admin/overview").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert err">{error}</div>;
  if (!data) return <p className="muted">Chargement…</p>;

  const stat = (num: string | number, label: string) => (
    <div className="card stat" key={label}>
      <div className="num">{num}</div>
      <div className="lbl">{label}</div>
    </div>
  );

  return (
    <>
      <div className="grid3" style={{ marginBottom: 20 }}>
        {stat(data.events.published, "Événements publiés")}
        {stat(data.events.this_month, "Créés ce mois-ci")}
        {stat(data.users.total, "Comptes utilisateurs")}
        {stat(data.companies.total, "Entreprises inscrites")}
        {stat(formatPrice(data.sales.gmv_cents), "Volume d'affaires (GMV)")}
        {stat(formatPrice(data.sales.platform_fees_cents), "Frais de service perçus")}
        {stat(data.sales.tickets_sold, "Billets vendus")}
        {stat(`${data.connect.accounts_enabled} / ${data.connect.accounts_started}`, "Comptes Connect activés")}
        {stat(data.users.suspended, "Comptes suspendus")}
      </div>
    </>
  );
}
