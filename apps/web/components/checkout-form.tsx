"use client";

import { useEffect, useState } from "react";
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
  categories: initialCategories,
  sellerCode,
}: {
  slug: string;
  categories: Category[];
  sellerCode?: string;
}) {
  // La page événement est mise en cache 60 s : les compteurs rendus côté serveur
  // peuvent être légèrement en retard. On les rafraîchit à l'affichage du
  // formulaire, seul endroit où le nombre de places restantes engage l'acheteur.
  const [categories, setCategories] = useState(initialCategories);
  const [catId, setCatId] = useState(initialCategories[0]?.id ?? "");
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

  useEffect(() => {
    let canceled = false;
    api<{ categories: Category[] }>(`/api/public/events/${slug}`, { auth: false })
      .then((data) => {
        // Les quotas vendeur ne sont pas dans la réponse publique : on ne remplace
        // que les compteurs de stock, et on garde le reste des props d'origine.
        if (canceled || !data.categories?.length) return;
        setCategories((current) =>
          current.map((c) => {
            const fresh = data.categories.find((f) => f.id === c.id);
            return fresh ? { ...c, quantity: fresh.quantity, sold: fresh.sold } : c;
          }),
        );
      })
      .catch(() => {
        // Silencieux : les compteurs du rendu serveur restent affichés, et c'est
        // de toute façon la réservation qui fait foi.
      });
    return () => {
      canceled = true;
    };
  }, [slug]);

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
      <div className="alert ok" role="status">
        <strong>Vous êtes sur la liste d&apos;attente !</strong> Nous vous préviendrons par email si une place se
        libère.
      </div>
    );
  }

  if (done) {
    return (
      <div className="alert ok" role="status">
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
            <label htmlFor="qty">Quantité</label>
            <input
              id="qty"
              type="number"
              min={1}
              max={Math.min(10, remaining)}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="name">Nom complet (billet nominatif)</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
      )}
      {soldOut && (
        <>
          <label htmlFor="name">Nom complet</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}
      <label htmlFor="email">Email {soldOut ? "" : "(réception des billets)"}</label>
      <input id="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {!soldOut && (
        <div className="check">
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <label htmlFor="consent" style={{ margin: 0, fontWeight: 400 }}>
            J&apos;accepte que mes coordonnées soient utilisées pour la gestion de cet événement (elles seront
            supprimées 30 jours après l&apos;événement).
          </label>
        </div>
      )}
      {error && <div className="alert err" role="alert">{error}</div>}
      <button type="submit" className="btn-accent" disabled={busy || !selected}>
        {busy
          ? "Traitement…"
          : soldOut
            ? "Rejoindre la liste d'attente"
            : selected && selected.price_cents > 0
              ? `Payer ${formatPrice(selected.price_cents * qty, selected.currency)}`
              : "Obtenir mes billets"}
      </button>
      {!soldOut && selected && selected.price_cents > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Des frais de service peuvent s&apos;ajouter au moment du paiement sécurisé.
        </p>
      )}
    </form>
  );
}
