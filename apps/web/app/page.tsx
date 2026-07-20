"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Mail, Ticket, BarChart3, Sparkles, ChevronDown, ArrowRight, PartyPopper, ShieldCheck, Handshake, Store } from "lucide-react";
import { api } from "@/lib/api";
import { Reveal } from "@/components/reveal";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  BamilekeDivider, ConstellationBg, GoldDust, HeroFx, LeopardRosettes, SpiderMark,
  SplitTitle, StatNumber, StepsPath, TiltCard,
} from "@/components/landing-fx";

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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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
    <>
      <div className="landing-hero">
        <ParticleHero />
        <HeroFx />
        <div className="landing-hero-content">
          <span className="hero-badge">
            <span className="dot" />
            Invitations · RSVP · Billetterie
          </span>
          <SplitTitle as="h1" mode="load">
            Vos événements, <em>sans les relances</em>
          </SplitTitle>
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
        <GoldDust />
        <div className="hero-stats-bar">
          {STATS.map((s) => (
            <div className="hero-stat glass" key={s.label}>
              <s.icon />
              <div>
                <StatNumber value={s.num} />
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
              <TiltCard>
                <div className="card feature">
                  <div className="glass-icon feature-icon">
                    <f.icon />
                  </div>
                  <h3>{f.title}</h3>
                  <p className="muted">{f.text}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <section id="how" className="section">
          <Reveal>
            <span className="section-kicker">Trois étapes</span>
            <SplitTitle className="section-title">Comment ça marche</SplitTitle>
            <p className="section-sub">De la création à l&apos;accueil du jour J, sans jongler entre dix outils.</p>
          </Reveal>
          <div className="steps-wrap">
            <StepsPath />
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
          </div>
        </section>

        <Reveal>
          <BamilekeDivider />
        </Reveal>

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

        <Reveal>
          <div className="payments-strip glass">
            <div className="payments-strip-head">
              <ShieldCheck />
              <div>
                <strong>Paiement 100&nbsp;% sécurisé</strong>
                <span className="muted">Propulsé par Stripe — vos clients paient comme ils préfèrent.</span>
              </div>
            </div>
            <ul className="payments-methods">
              {["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay"].map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </Reveal>

        <section className="section marketplace-section">
          <ConstellationBg />
          <Reveal>
            <SpiderMark />
            <span className="section-kicker">Place de marché</span>
            <SplitTitle className="section-title">Le sponsoring, simplifié</SplitTitle>
            <p className="section-sub">
              Les associations trouvent des sponsors, les entreprises gagnent en visibilité — tout se passe sur
              EventGalo, de la mise en relation au paiement.
            </p>
          </Reveal>
          <div className="grid2">
            <Reveal>
              <div className="card usecase">
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Handshake />
                  </div>
                  <h3 style={{ margin: 0 }}>Organisateurs : trouvez des sponsors</h3>
                </div>
                <p className="muted">
                  Créez vos paliers (Officiel, Or, Argent…) avec avantages et niveaux de visibilité, invitez des
                  entreprises depuis l&apos;annuaire en un clic, encaissez en ligne. Leurs vitrines s&apos;affichent
                  automatiquement sur votre page.
                </p>
                <a href="/sponsors" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                  Parcourir l&apos;annuaire des sponsors
                </a>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="card usecase" style={{ position: "relative", overflow: "hidden" }}>
                <LeopardRosettes />
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Store />
                  </div>
                  <h3 style={{ margin: 0 }}>Entreprises : gagnez en visibilité</h3>
                </div>
                <p className="muted">
                  Créez votre profil gratuit, apparaissez dans l&apos;annuaire, recevez des propositions — ou
                  choisissez vous-même les événements à sponsoriser. Votre vitrine (logo, photos, vidéo, liens)
                  vous met en valeur auprès du public.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <a href="/entreprise" className="btn btn-ghost btn-sm">
                    Créer mon profil gratuit
                  </a>
                  <a href="/opportunites" className="muted" style={{ fontSize: 13 }}>
                    Voir les événements à sponsoriser
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

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
          </Reveal>
        </section>

        <footer className="landing-footer muted">
        <p style={{ margin: "0 0 8px" }}>EventGalo — invitations, RSVP et billetterie pour vos événements.</p>
        <p style={{ margin: "0 0 8px" }}>
            <a href="/sponsors">Annuaire des sponsors</a> · <a href="/prestataires">Annuaire des prestataires</a> · <a href="/opportunites">Événements à sponsoriser</a> · <a href="/entreprise">Espace entreprise</a>
          </p>
        <p style={{ margin: 0 }}>
            <a href="/cgu">Conditions générales d&apos;utilisation</a> · <a href="/confidentialite">Politique de confidentialité</a>
          </p>
        </footer>
      </main>
    </>
  );
}
