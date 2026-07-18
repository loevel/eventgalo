"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Mail, Ticket, BarChart3, Sparkles, ChevronDown, ArrowRight, PartyPopper, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Reveal } from "@/components/reveal";

const ParticleHero = dynamic(() => import("@/components/particle-hero").then((m) => m.ParticleHero), {
  ssr: false,
});

const FEATURES = [
  {
    icon: Mail,
    title: "Invitations personnalisées",
    text: "Chaque invité reçoit son propre lien : programme, lieu, dress code. Vous voyez qui a ouvert et qui a confirmé, sans relancer personne.",
  },
  {
    icon: Ticket,
    title: "Billetterie sécurisée",
    text: "Catégories Standard, VIP, VIP+ avec paiement en ligne. QR codes signés à usage unique, impossibles à dupliquer.",
  },
  {
    icon: BarChart3,
    title: "Suivi par vendeur",
    text: "Attribuez des quotas à vos vendeurs et suivez leurs ventes en temps réel. Le jour J, scannez les billets à l'entrée depuis votre téléphone.",
  },
];

const STATS = [
  { icon: PartyPopper, num: "100%", label: "sans carte bancaire pour démarrer" },
  { icon: ShieldCheck, num: "0", label: "billet dupliqué — QR signés" },
  { icon: Sparkles, num: "3 min", label: "pour publier un événement" },
];

const STEPS = [
  {
    num: "1",
    title: "Créez votre événement",
    text: "Anniversaire, gala, soirée communautaire : décrivez votre événement en quelques minutes, sans carte bancaire.",
  },
  {
    num: "2",
    title: "Invitez ou vendez",
    text: "Envoyez des invitations avec RSVP en un clic, ou mettez vos billets en vente avec vos propres vendeurs.",
  },
  {
    num: "3",
    title: "Accueillez sereinement",
    text: "Le jour J, scannez les QR codes à l'entrée. Chaque billet n'est valide qu'une seule fois — zéro fraude, zéro stress.",
  },
];

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
    <>
      <div className="landing-hero">
        <ParticleHero />
        <div className="landing-hero-content">
          <span className="hero-badge">
            <span className="dot" />
            Invitations · RSVP · Billetterie
          </span>
          <h1>
            Vos événements, <em>sans les relances</em>
          </h1>
          <p>
            Une fiche unique par événement, des invitations personnalisées avec RSVP en un clic, et une
            billetterie sécurisée avec suivi par vendeur — anniversaires, galas, soirées communautaires.
          </p>
          <div className="cta-row">
            <a href="#login" className="btn btn-gold">
              Commencer gratuitement <ArrowRight />
            </a>
            <a href="#how" className="btn btn-outline-light glass glass-btn">
              Comment ça marche ?
            </a>
          </div>
        </div>
        <div className="hero-scroll-cue">
          <span>Découvrir</span>
          <ChevronDown className="scroll-chevron" />
        </div>
      </div>

      <div className="hero-stats-wrap">
        <div className="hero-stats-bar">
          {STATS.map((s) => (
            <div className="hero-stat glass" key={s.label}>
              <s.icon />
              <div>
                <span className="hero-stat-num">{s.num}</span>
                <span className="hero-stat-lbl">{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <main className="container landing">
        <div className="grid3 features-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="card feature">
                <div className="glass-icon feature-icon">
                  <f.icon />
                </div>
                <h3>{f.title}</h3>
                <p className="muted">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <section id="how" className="section">
          <Reveal>
            <span className="section-kicker">Trois étapes</span>
            <h2 className="section-title">Comment ça marche</h2>
            <p className="section-sub">De la création à l&apos;accueil du jour J, sans jongler entre dix outils.</p>
          </Reveal>
          <div className="grid3">
            {STEPS.map((s, i) => (
              <Reveal key={s.num} delay={i * 90}>
                <div className="step">
                  <div className="step-num">{s.num}</div>
                  <h3>{s.title}</h3>
                  <p className="muted">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <div className="grid2 usecases">
          <Reveal>
            <div className="card usecase">
              <div className="usecase-head">
                <div className="glass-icon">
                  <PartyPopper />
                </div>
                <h3 style={{ margin: 0 }}>Événements privés</h3>
              </div>
              <p className="muted">
                Lieu, plan de table, dress code : tout dans un lien. Chaque invité a le sien — vous voyez qui a
                ouvert, qui a confirmé.
              </p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="card usecase">
              <div className="usecase-head">
                <div className="glass-icon">
                  <Ticket />
                </div>
                <h3 style={{ margin: 0 }}>Galas &amp; billetterie</h3>
              </div>
              <p className="muted">
                Catégories Standard / VIP / VIP+, quotas par vendeur, paiement en ligne, QR codes signés à usage
                unique et scan à l&apos;entrée.
              </p>
            </div>
          </Reveal>
        </div>

        <section id="login" className="section login-section">
          <Reveal>
            <div className="card login-card">
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
          </Reveal>
        </section>

        <footer className="landing-footer muted">
        <p style={{ margin: "0 0 8px" }}>EventGalo — invitations, RSVP et billetterie pour vos événements.</p>
        <p style={{ margin: 0 }}>
            <a href="/cgu">Conditions générales d&apos;utilisation</a> · <a href="/confidentialite">Politique de confidentialité</a>
          </p>
        </footer>
      </main>
    </>
  );
}
