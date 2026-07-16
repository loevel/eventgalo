"use client";

import { useState } from "react";
import { api, formatPrice } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
  sold: number;
  quota?: number | null;
  seller_sold?: number | null;
}

export function CheckoutForm({
  slug,
  categories,
  sellerCode,
}: {
  slug: string;
  categories: Category[];
  sellerCode?: string;
}) {
  const [catId, setCatId] = useState(categories[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Array<{ serial: string; url: string }> | null>(null);

  const selected = categories.find((c) => c.id === catId);
  const remaining = selected ? selected.quantity - selected.sold : 0;

  if (done) {
    return (
      <div className="alert ok">
        <strong>Billets émis !</strong> Un email de confirmation a été envoyé.
        {done.map((t) => (
          <p key={t.serial}>
            <a href={t.url}>🎟️ Billet {t.serial}</a>
          </p>
        ))}
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        mode: string;
        checkout_url?: string;
        tickets?: Array<{ serial: string; url: string }>;
      }>("/api/public/checkout", {
        method: "POST",
        auth: false,
        body: {
          slug,
          category_id: catId,
          quantity: qty,
          buyer_name: name,
          buyer_email: email,
          seller_code: sellerCode,
          consent,
        },
      });
      if (res.mode === "stripe" && res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setDone(res.tickets ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  if (!categories.length) return <p className="muted">La billetterie n&apos;est pas encore ouverte.</p>;

  return (
    <form onSubmit={submit}>
      <label>Catégorie</label>
      <select value={catId} onChange={(e) => setCatId(e.target.value)}>
        {categories.map((c) => (
          <option key={c.id} value={c.id} disabled={c.quantity - c.sold <= 0}>
            {c.name} — {formatPrice(c.price_cents, c.currency)}
            {c.quantity - c.sold <= 0 ? " (épuisé)" : ` (${c.quantity - c.sold} restants)`}
          </option>
        ))}
      </select>
      <div className="grid2">
        <div>
          <label>Quantité</label>
          <input
            type="number"
            min={1}
            max={Math.min(10, remaining)}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </div>
        <div>
          <label>Nom complet (billet nominatif)</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <label>Email (réception des billets)</label>
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="check">
        <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <label htmlFor="consent" style={{ margin: 0, fontWeight: 400 }}>
          J&apos;accepte que mes coordonnées soient utilisées pour la gestion de cet événement (elles seront
          supprimées 30 jours après l&apos;événement).
        </label>
      </div>
      {error && <div className="alert err">{error}</div>}
      <button type="submit" className="btn-accent" disabled={busy || !selected}>
        {busy
          ? "Traitement…"
          : selected && selected.price_cents > 0
            ? `Payer ${formatPrice(selected.price_cents * qty, selected.currency)}`
            : "Obtenir mes billets"}
      </button>
    </form>
  );
}
