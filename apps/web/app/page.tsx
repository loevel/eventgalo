"use client";

import dynamic from "next/dynamic";
import { Mail, Ticket, BarChart3, Sparkles, ChevronDown, ArrowRight, PartyPopper, ShieldCheck, Handshake, Store } from "lucide-react";
import { Reveal } from "@/components/reveal";
import {
  BamilekeDivider, ConstellationBg, GoldDust, HeroFx, LeopardRosettes, SectionDepthFx, SpiderMark,
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
            <a href="/connexion" className="btn btn-gold">
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
        <SectionDepthFx />
        <div className="grid3 features-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <TiltCard>
                <div className="card feature depth-fx">
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
            <div className="card usecase depth-fx">
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
            <div className="card usecase depth-fx">
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
          <div className="payments-strip glass depth-fx">
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
              <div className="card usecase depth-fx">
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
              <div className="card usecase depth-fx" style={{ position: "relative", overflow: "hidden" }}>
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
      </main>
    </>
  );
}
