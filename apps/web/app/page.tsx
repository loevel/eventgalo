"use client";

import { useState } from "react";
import {
  Mail, Ticket, BarChart3, Sparkles, ChevronDown, ArrowRight, PartyPopper, ShieldCheck, Handshake, Store, Star,
  Search, Wand2, Camera,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { AdBand } from "@/components/ad-band";
import { HeroCarousel } from "@/components/hero-carousel";
import {
  BamilekeDivider, ConstellationBg, GoldDust, HeroFx, LeopardRosettes, SectionDepthFx, SpiderMark,
  SplitTitle, StatNumber, StepsPath, TiltCard,
} from "@/components/landing-fx";

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

const AI_FEATURES = [
  {
    icon: Search,
    title: "Recherche en langage naturel",
    text: "Décrivez ce que vous cherchez — « entreprises vérifiées de Montréal en événementiel » ou « galas en septembre » — l'IA traduit votre phrase en filtres, dans l'annuaire comme dans les opportunités de sponsoring.",
  },
  {
    icon: Wand2,
    title: "Programme suggéré par l'IA",
    text: "Un bouton « Suggérer avec l'IA » propose un déroulé complet à partir du thème et de l'horaire de votre événement — à ajuster librement ou publier tel quel.",
  },
  {
    icon: ShieldCheck,
    title: "Confiance vérifiée",
    text: "Badge « Vérifiée » par email professionnel ou registre canadien des entreprises, et détection assistée par IA des profils suspects côté modération.",
  },
];

const FAQS = [
  {
    q: "Est-ce gratuit d'utiliser EventGalo ?",
    a: "Créer un compte et publier un événement est gratuit, sans carte bancaire. Des frais de service s'appliquent uniquement sur les transactions (vente de billets, sponsoring), prélevés automatiquement via Stripe au moment du paiement.",
  },
  {
    q: "Puis-je inviter des gens sans vendre de billets ?",
    a: "Oui. Pour un anniversaire ou une soirée privée, chaque invité reçoit un lien personnalisé (lieu, dress code, programme) et confirme sa présence en un clic — aucun paiement n'est nécessaire.",
  },
  {
    q: "Comment fonctionne la billetterie et le paiement ?",
    a: "Vos clients paient en ligne par carte, Apple Pay ou Google Pay via Stripe. Chaque billet est envoyé immédiatement avec un QR code signé à usage unique : impossible à dupliquer, et le scan à l'entrée le jour J invalide définitivement le billet.",
  },
  {
    q: "Comment fonctionne le suivi par vendeur ?",
    a: "Vous pouvez attribuer des quotas de billets à vos vendeurs et suivre leurs ventes en temps réel depuis votre tableau de bord, puis scanner les billets à l'entrée depuis n'importe quel téléphone.",
  },
  {
    q: "Comment trouver des sponsors pour mon événement ?",
    a: "Créez vos paliers de sponsoring (Officiel, Or, Argent…) avec avantages et niveaux de visibilité, puis invitez des entreprises depuis l'annuaire ou laissez-les vous proposer un sponsoring. L'encaissement se fait en ligne, et leur vitrine s'affiche automatiquement sur la page de votre événement.",
  },
  {
    q: "Je suis prestataire (photographe, décorateur, traiteur…) : comment être visible ?",
    a: "Créez gratuitement votre profil depuis « Créer mon profil », que vous soyez une entreprise ou un indépendant. Vous apparaissez ensuite dans l'annuaire des prestataires et pouvez être contacté directement par des organisateurs.",
  },
  {
    q: "Comment savoir si un sponsor ou un prestataire est fiable ?",
    a: "Les profils vérifiés portent un badge « Vérifiée » : validation par email au domaine du site web de l'entreprise, ou concordance avec le registre canadien des entreprises. Notre équipe s'appuie aussi sur une détection assistée par IA pour repérer les profils suspects avant qu'ils ne posent problème.",
  },
  {
    q: "Puis-je mettre mon entreprise en avant sur la page d'accueil ?",
    a: "Oui : depuis votre espace entreprise, achetez un créneau dans le bandeau publicitaire de la page d'accueil, à la semaine, avec ciblage optionnel par secteur d'activité ou par région.",
  },
  {
    q: "Mes paiements et mes données sont-ils sécurisés ?",
    a: "Tous les paiements sont traités par Stripe, qui gère la conformité PCI-DSS — EventGalo ne stocke aucune donnée de carte bancaire. La connexion se fait sans mot de passe, par lien magique envoyé par email.",
  },
];

const PAYMENT_LOGOS = [
  { src: "/payments/visa.svg", alt: "Visa" },
  { src: "/payments/mastercard.svg", alt: "Mastercard" },
  { src: "/payments/americanexpress.svg", alt: "American Express" },
  { src: "/payments/applepay.svg", alt: "Apple Pay" },
  { src: "/payments/googlepay.svg", alt: "Google Pay" },
];

const TESTIMONIALS = [
  {
    rating: 5,
    hook: "Un gain de temps incroyable pour nos événements !",
    quote:
      "Nous avons utilisé EventGalo pour l'organisation de notre gala annuel et tout s'est déroulé à merveille. Le suivi par vendeur est hyper pratique, et le système de scan par QR code le jour J nous a évité les files d'attente à l'entrée. Un vrai plus : la recherche de sponsors intégrée !",
    author: "Marc L.",
    role: "Président d'association",
  },
  {
    rating: 5,
    hook: "Fini les relances sans fin pour le RSVP !",
    quote:
      "J'ai créé la page de mon anniversaire en moins de 5 minutes. Les invités reçoivent leur propre lien personnalisé avec le lieu et le dress code. Pouvoir suivre en temps réel qui a ouvert et confirmé l'invitation sans avoir à relancer tout le monde sur WhatsApp, c'est tout simplement génial.",
    author: "Sophie T.",
    role: "Organisatrice d'anniversaire",
  },
  {
    rating: 5,
    hook: "Une belle opportunité de visibilité locale.",
    quote:
      "En tant que gérant d'entreprise, la marketplace de sponsoring m'a permis de trouver rapidement des événements pertinents à soutenir dans ma région. La création de vitrine est simple et la transaction s'est faite en toute sécurité via Stripe.",
    author: "Karim B.",
    role: "Directeur de cabinet conseil",
  },
  {
    rating: 4,
    hook: "Très pratique pour trouver de nouveaux contrats.",
    quote:
      "La plateforme est claire, intuitive et sans prise de tête. Pouvoir s'inscrire dans l'annuaire et proposer ses services directement aux organisateurs simplifie énormément la prospection. Je recommande !",
    author: "Élodie M.",
    role: "Photographe événementiel",
  },
  {
    rating: 5,
    hook: "Simple, fluide et sécurisé.",
    quote:
      "J'avais un quota de billets à vendre pour la soirée de mon club étudiant. Le suivi en temps réel sur la plateforme m'a permis de voir mes ventes au jour le jour. Le jour de la soirée, aucun doublon ni problème de fraude grâce au scan unique.",
    author: "Thomas P.",
    role: "Responsable billetterie",
  },
  {
    rating: 5,
    hook: "Achat rapide et expérience fluide.",
    quote:
      "J'ai acheté mon billet VIP pour une soirée communautaire via EventGalo. Paiement rapide par Apple Pay, billet avec QR code reçu immédiatement. L'entrée s'est faite en 2 secondes à l'accueil. Top !",
    author: "Claire D.",
    role: "Participante",
  },
];

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <div className="landing-hero">
        <HeroCarousel />
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
        <div className="grid-bento features-grid">
          <Reveal className="bento-span-8">
            <TiltCard>
              <div className="card feature depth-fx">
                <div className="glass-icon feature-icon">
                  <Ticket />
                </div>
                <h3>{FEATURES[1].title}</h3>
                <p className="muted">{FEATURES[1].text}</p>
              </div>
            </TiltCard>
          </Reveal>
          <Reveal delay={90} className="bento-span-4">
            <TiltCard>
              <div className="card feature feature-accent depth-fx">
                <div className="glass-icon feature-icon feature-icon-accent">
                  <BarChart3 />
                </div>
                <h3>{FEATURES[2].title}</h3>
                <p>{FEATURES[2].text}</p>
                <div className="feature-bars">
                  {[0.5, 0.75, 1, 0.65, 0.85].map((h, i) => (
                    <div key={i} className="feature-bar" style={{ height: `${h * 100}%` }} />
                  ))}
                </div>
              </div>
            </TiltCard>
          </Reveal>
          <Reveal delay={180} className="bento-span-12">
            <TiltCard>
              <div className="card feature feature-wide depth-fx">
                <div className="glass-icon feature-icon">
                  <Mail />
                </div>
                <h3>{FEATURES[0].title}</h3>
                <p className="muted">{FEATURES[0].text}</p>
              </div>
            </TiltCard>
          </Reveal>
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

        <section className="section">
          <Reveal>
            <span className="section-kicker">Intelligence artificielle</span>
            <SplitTitle className="section-title">L&apos;IA travaille pour vous</SplitTitle>
            <p className="section-sub">
              Recherche, rédaction, vérification : Workers AI accélère la plateforme sans jamais remplacer votre
              jugement.
            </p>
          </Reveal>
          <div className="grid3">
            {AI_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="card usecase depth-fx">
                  <div className="usecase-head">
                    <div className="glass-icon">
                      <f.icon />
                    </div>
                    <h3 style={{ margin: 0 }}>{f.title}</h3>
                  </div>
                  <p className="muted">{f.text}</p>
                </div>
              </Reveal>
            ))}
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
            <div className="payments-marquee">
              <div className="payments-track">
                {[...PAYMENT_LOGOS, ...PAYMENT_LOGOS].map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- logo fixe et léger, next/image est superflu ici
                  <img key={`${p.alt}-${i}`} src={p.src} alt={i < PAYMENT_LOGOS.length ? p.alt : ""} aria-hidden={i >= PAYMENT_LOGOS.length} />
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <AdBand />
        </Reveal>

        <section className="section">
          <Reveal>
            <span className="section-kicker">Avis clients</span>
            <SplitTitle className="section-title">Ils nous font confiance</SplitTitle>
            <p className="section-sub">Organisateurs, sponsors, prestataires et invités racontent leur expérience.</p>
          </Reveal>
          <div className="grid3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.author} delay={(i % 3) * 90}>
                <div className="card testimonial depth-fx">
                  <div className="testimonial-stars">
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star key={j} size={15} className={j < t.rating ? "filled" : undefined} fill={j < t.rating ? "currentColor" : "none"} />
                    ))}
                  </div>
                  <p className="testimonial-hook">« {t.hook} »</p>
                  <p className="testimonial-quote">{t.quote}</p>
                  <div className="testimonial-author">
                    <strong>{t.author}</strong> — {t.role}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section marketplace-section">
          <ConstellationBg />
          <Reveal>
            <SpiderMark />
            <span className="section-kicker">Place de marché</span>
            <SplitTitle className="section-title">La marketplace, simplifiée</SplitTitle>
            <p className="section-sub">
              Les associations trouvent des sponsors et des prestataires, les entreprises gagnent en visibilité —
              tout se passe sur EventGalo, de la mise en relation au paiement.
            </p>
          </Reveal>
          <div className="grid3">
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
              <div className="card usecase depth-fx">
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Camera />
                  </div>
                  <h3 style={{ margin: 0 }}>Organisateurs : trouvez vos prestataires</h3>
                </div>
                <p className="muted">
                  Photographe, traiteur, DJ, décoration, salle de réception… parcourez l&apos;annuaire des
                  prestataires, filtrez par secteur et par ville, et contactez-les directement.
                </p>
                <a href="/prestataires" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                  Parcourir l&apos;annuaire des prestataires
                </a>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="card usecase depth-fx" style={{ position: "relative", overflow: "hidden" }}>
                <LeopardRosettes />
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Store />
                  </div>
                  <h3 style={{ margin: 0 }}>Entreprises &amp; prestataires : gagnez en visibilité</h3>
                </div>
                <p className="muted">
                  Créez votre profil gratuit, apparaissez dans l&apos;annuaire des sponsors et/ou des prestataires,
                  recevez des propositions, et décrochez un badge « Vérifiée ». Vous pouvez aussi acheter un
                  créneau dans le bandeau publicitaire de la page d&apos;accueil, ciblé par secteur ou par région.
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

        <section className="section">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: FAQS.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
          <Reveal>
            <span className="section-kicker">Questions fréquentes</span>
            <SplitTitle className="section-title">Vous vous posez des questions ?</SplitTitle>
          </Reveal>
          <div className="faq-list">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <Reveal key={f.q} delay={Math.min(i, 6) * 60}>
                  <div className={`faq-item${open ? " open" : ""}`}>
                    <button
                      type="button"
                      className="faq-question"
                      aria-expanded={open}
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      {f.q}
                      <ChevronDown className="faq-chevron" size={18} />
                    </button>
                    {open && <p className="faq-answer">{f.a}</p>}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
