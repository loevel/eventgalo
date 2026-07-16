"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; text: string; url?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ message: string; debug_url?: string }>("/api/auth/magic-link", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setStatus({ kind: res.debug_url ? "info" : "ok", text: res.message, url: res.debug_url });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container narrow">
      <div className="hero">
        <h1>Vos événements, sans les relances</h1>
        <p>
          Une fiche unique par événement, des invitations personnalisées avec RSVP en un clic, et une
          billetterie sécurisée avec suivi par vendeur — anniversaires, galas, soirées communautaires.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Connexion / Inscription</h2>
        <p className="muted">Pas de mot de passe : recevez un lien magique par email.</p>
        <form onSubmit={requestLink}>
          <label htmlFor="email">Votre email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />
          <button type="submit" className="btn-accent" disabled={busy}>
            {busy ? "Envoi…" : "Recevoir mon lien de connexion"}
          </button>
        </form>
        {status && (
          <div className={`alert ${status.kind === "err" ? "err" : status.kind === "ok" ? "ok" : "info"}`}>
            {status.text}
            {status.url && (
              <p>
                <a href={status.url}>→ Ouvrir le lien de connexion</a>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🎂 Événements privés</h3>
          <p className="muted">
            Lieu, plan de table, dress code : tout dans un lien. Chaque invité a le sien — vous voyez qui a
            ouvert, qui a confirmé.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🎟️ Galas &amp; billetterie</h3>
          <p className="muted">
            Catégories Standard / VIP / VIP+, quotas par vendeur, paiement en ligne, QR codes signés à usage
            unique et scan à l&apos;entrée.
          </p>
        </div>
      </div>
    </main>
  );
}
