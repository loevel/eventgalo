"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { TurnstileWidget } from "@/components/turnstile-widget";

const COPY = {
  entreprise: {
    title: "Connexion — Espace entreprise & prestataires",
    subtitle: "Créez votre profil entreprise ou prestataire, sans mot de passe : recevez un lien magique par email.",
  },
  default: {
    title: "Connexion / Inscription",
    subtitle: "Pas de mot de passe : recevez un lien magique par email.",
  },
};

export default function Connexion() {
  return (
    <Suspense fallback={null}>
      <ConnexionForm />
    </Suspense>
  );
}

function ConnexionForm() {
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent") === "entreprise" ? "entreprise" : "default";
  const next = searchParams.get("next");
  const copy = COPY[intent];

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; text: string; url?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (next) sessionStorage.setItem("eg_login_next", next);
  }, [next]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ message: string; debug_url?: string }>("/api/auth/magic-link", {
        method: "POST",
        body: { email, turnstile_token: turnstileToken },
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
    <main className="container">
      <section className="section login-section">
        <div className="card login-card">
          <h2 style={{ marginTop: 0 }}>{copy.title}</h2>
          <p className="muted">{copy.subtitle}</p>
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
            <TurnstileWidget onVerify={setTurnstileToken} />
            <button
              type="submit"
              className="btn-accent"
              disabled={busy || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}
            >
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
      </section>
    </main>
  );
}
