"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { api, formatPrice } from "@/lib/api";
import { parsePerks } from "@/lib/perks";

interface Category {
  id: string;
  name: string;
  perks?: string | null;
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
  const [waitlistDone, setWaitlistDone] = useState(false);

  const selected = categories.find((c) => c.id === catId);
  const remaining = selected ? selected.quantity - selected.sold : 0;

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/public/waitlist", {
        method: "POST",
        auth: false,
        body: { category_id: selected.id, name, email },
      });
      setWaitlistDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (waitlistDone) {
    return (
      <div className="alert ok">
        <strong>Vous êtes sur la liste d&apos;attente !</strong> Nous vous préviendrons par email si une place se
        libère.
      </div>
    );
  }

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

  const soldOut = !!selected && remaining <= 0;

  return (
    <form onSubmit={soldOut ? joinWaitlist : submit}>
      <label>Catégorie</label>
      {categories.map((c) => {
        const catRemaining = c.quantity - c.sold;
        const isSoldOut = catRemaining <= 0;
        const isLow = !isSoldOut && catRemaining <= 5;
        const perks = parsePerks(c.perks);
        const isSelected = catId === c.id;
        return (
          <div
            key={c.id}
            className={`cat-card ${isSelected ? "selected" : ""} ${isSoldOut ? "disabled" : ""} ${perks.length ? "has-perks" : ""}`}
            onClick={() => setCatId(c.id)}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
          >
            <div className="cat-card-head">
              <div>
                <div className="cat-name">{c.name}</div>
                <div className={`cat-remaining ${isLow ? "low" : ""}`}>
                  {isSoldOut ? "Épuisé" : isLow ? (
                    <>
                      <span className="pulse-dot" style={{ marginRight: 5 }} />
                      Plus que {catRemaining} place{catRemaining > 1 ? "s" : ""} !
                    </>
                  ) : (
                    `${catRemaining} places disponibles`
                  )}
                </div>
              </div>
              <div className="cat-price">{formatPrice(c.price_cents, c.currency)}</div>
            </div>
            {perks.length > 0 && (
              <ul className="cat-perks">
                {perks.map((p, i) => (
                  <li key={i} style={{ transitionDelay: isSelected ? `${i * 45}ms` : "0ms" }}>
                    <Check /> {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {soldOut ? (
        <p className="muted">
          Cette catégorie est épuisée. Inscrivez-vous sur la liste d&apos;attente pour être prévenu·e si une place se
          libère.
        </p>
      ) : (
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
      )}
      {soldOut && (
        <>
          <label>Nom complet</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}
      <label>Email {soldOut ? "" : "(réception des billets)"}</label>
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {!soldOut && (
        <div className="check">
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <label htmlFor="consent" style={{ margin: 0, fontWeight: 400 }}>
            J&apos;accepte que mes coordonnées soient utilisées pour la gestion de cet événement (elles seront
            supprimées 30 jours après l&apos;événement).
          </label>
        </div>
      )}
      {error && <div className="alert err">{error}</div>}
      <button type="submit" className="btn-accent" disabled={busy || !selected}>
        {busy
          ? "Traitement…"
          : soldOut
            ? "Rejoindre la liste d'attente"
            : selected && selected.price_cents > 0
              ? `Payer ${formatPrice(selected.price_cents * qty, selected.currency)}`
              : "Obtenir mes billets"}
      </button>
    </form>
  );
}
