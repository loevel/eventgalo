"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Mail, Ticket, BarChart3, Sparkles, ChevronDown, ArrowRight, PartyPopper, ShieldCheck, Handshake, Store, Star,
  Search, Wand2, Camera,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { AdBand } from "@/components/ad-band";
import { HeroCarousel } from "@/components/hero-carousel";
import {
  BamilekeDivider, HeroFx, LeopardRosettes, SectionDepthFx, SpiderMark,
  SplitTitle, StatNumber, StepsPath, TiltCard,
} from "@/components/landing-fx";

const STAT_KEYS = ["noCard", "zeroFraud", "threeMin"] as const;
const STAT_ICONS = { noCard: PartyPopper, zeroFraud: ShieldCheck, threeMin: Sparkles };

const STEP_KEYS = ["create", "invite", "welcome"] as const;
const STEP_NUMS = { create: "1", invite: "2", welcome: "3" };

const AI_FEATURE_KEYS = ["search", "agenda", "trust"] as const;
const AI_FEATURE_ICONS = { search: Search, agenda: Wand2, trust: ShieldCheck };

const VENDOR_KEYS = ["vendor1", "vendor2", "vendor3"] as const;
const VENDOR_STATS = {
  vendor1: { tickets: 42, pct: 92 },
  vendor2: { tickets: 31, pct: 68 },
  vendor3: { tickets: 19, pct: 41 },
};

const PAYMENT_LOGOS = [
  { src: "/payments/visa.svg", alt: "Visa" },
  { src: "/payments/mastercard.svg", alt: "Mastercard" },
  { src: "/payments/americanexpress.svg", alt: "American Express" },
  { src: "/payments/applepay.svg", alt: "Apple Pay" },
  { src: "/payments/googlepay.svg", alt: "Google Pay" },
];

interface Faq {
  q: string;
  a: string;
}

interface Testimonial {
  rating: number;
  hook: string;
  quote: string;
  author: string;
  role: string;
}

export default function Home() {
  const t = useTranslations("HomePage");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqs = t.raw("faqs") as Faq[];
  const testimonials = t.raw("testimonials") as Testimonial[];

  return (
    <>
      <div className="landing-hero">
        <HeroCarousel />
        <HeroFx />
        <div className="landing-hero-content">
          <span className="hero-badge">
            <span className="dot" />
            {t("hero.badge")}
          </span>
          <SplitTitle as="h1" mode="load">
            {t("hero.titlePrefix")}
            <em>{t("hero.titleEmphasis")}</em>
          </SplitTitle>
          <p>{t("hero.subtitle")}</p>
          <div className="cta-row">
            <a href="/connexion" className="btn btn-gold">
              {t("hero.ctaPrimary")} <ArrowRight />
            </a>
            <a href="#how" className="btn btn-outline-light glass glass-btn">
              {t("hero.ctaSecondary")}
            </a>
          </div>
        </div>
        <div className="hero-scroll-cue">
          <span>{t("hero.scrollCue")}</span>
          <ChevronDown className="scroll-chevron" />
        </div>
      </div>

      <div className="hero-stats-wrap">
        <div className="hero-stats-bar">
          {STAT_KEYS.map((key) => {
            const Icon = STAT_ICONS[key];
            return (
              <div className="hero-stat" key={key}>
                <Icon />
                <div>
                  <StatNumber value={t(`stats.${key}.num`)} />
                  <span className="hero-stat-lbl">{t(`stats.${key}.label`)}</span>
                </div>
              </div>
            );
          })}
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
                <h3>{t("features.ticketing.title")}</h3>
                <p className="muted">{t("features.ticketing.text")}</p>
              </div>
            </TiltCard>
          </Reveal>
          <Reveal delay={90} className="bento-span-4">
            <TiltCard>
              <div className="card feature feature-accent depth-fx">
                <div className="glass-icon feature-icon feature-icon-accent">
                  <BarChart3 />
                </div>
                <h3>{t("features.sellerTracking.title")}</h3>
                <p>{t("features.sellerTracking.text")}</p>
                <div className="feature-vendors">
                  {VENDOR_KEYS.map((key) => (
                    <div className="feature-vendor-row" key={key}>
                      <span>{t(`vendors.${key}`)}</span>
                      <div className="feature-vendor-track">
                        <div className="feature-vendor-fill" style={{ width: `${VENDOR_STATS[key].pct}%` }} />
                      </div>
                      <strong>{VENDOR_STATS[key].tickets}</strong>
                    </div>
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
                <h3>{t("features.invitations.title")}</h3>
                <p className="muted">{t("features.invitations.text")}</p>
              </div>
            </TiltCard>
          </Reveal>
        </div>

        <section id="how" className="section">
          <Reveal>
            <span className="section-kicker">{t("steps.sectionKicker")}</span>
            <SplitTitle className="section-title">{t("steps.sectionTitle")}</SplitTitle>
            <p className="section-sub">{t("steps.sectionSub")}</p>
          </Reveal>
          <div className="steps-wrap">
            <StepsPath />
            <div className="grid3">
              {STEP_KEYS.map((key, i) => (
                <Reveal key={key} delay={i * 90}>
                  <div className="step">
                    <div className="step-num">{STEP_NUMS[key]}</div>
                    <h3>{t(`steps.${key}.title`)}</h3>
                    <p className="muted">{t(`steps.${key}.text`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <Reveal>
            <span className="section-kicker">{t("ai.sectionKicker")}</span>
            <SplitTitle className="section-title">{t("ai.sectionTitle")}</SplitTitle>
            <p className="section-sub">{t("ai.sectionSub")}</p>
          </Reveal>
          <div className="grid3">
            {AI_FEATURE_KEYS.map((key, i) => {
              const Icon = AI_FEATURE_ICONS[key];
              return (
                <Reveal key={key} delay={i * 90}>
                  <div className="card usecase depth-fx">
                    <div className="usecase-head">
                      <div className="glass-icon">
                        <Icon />
                      </div>
                      <h3 style={{ margin: 0 }}>{t(`ai.${key}.title`)}</h3>
                    </div>
                    <p className="muted">{t(`ai.${key}.text`)}</p>
                  </div>
                </Reveal>
              );
            })}
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
                <h3 style={{ margin: 0 }}>{t("useCases.private.title")}</h3>
              </div>
              <p className="muted">{t("useCases.private.text")}</p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="card usecase depth-fx">
              <div className="usecase-head">
                <div className="glass-icon">
                  <Ticket />
                </div>
                <h3 style={{ margin: 0 }}>{t("useCases.gala.title")}</h3>
              </div>
              <p className="muted">{t("useCases.gala.text")}</p>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="payments-strip depth-fx">
            <div className="payments-strip-head">
              <ShieldCheck />
              <div>
                <strong>{t("payments.title")}</strong>
                <span className="muted">{t("payments.subtitle")}</span>
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
            <span className="section-kicker">{t("testimonialsSection.sectionKicker")}</span>
            <SplitTitle className="section-title">{t("testimonialsSection.sectionTitle")}</SplitTitle>
            <p className="section-sub">{t("testimonialsSection.sectionSub")}</p>
          </Reveal>
          <div className="grid3">
            {testimonials.map((tst, i) => (
              <Reveal key={tst.author} delay={(i % 3) * 90}>
                <div className="card testimonial depth-fx">
                  <div className="testimonial-stars">
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star key={j} size={15} className={j < tst.rating ? "filled" : undefined} fill={j < tst.rating ? "currentColor" : "none"} />
                    ))}
                  </div>
                  <p className="testimonial-hook">« {tst.hook} »</p>
                  <p className="testimonial-quote">{tst.quote}</p>
                  <div className="testimonial-author">
                    <strong>{tst.author}</strong> — {tst.role}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section marketplace-section">
          <Reveal>
            <SpiderMark />
            <span className="section-kicker">{t("marketplace.sectionKicker")}</span>
            <SplitTitle className="section-title">{t("marketplace.sectionTitle")}</SplitTitle>
            <p className="section-sub">{t("marketplace.sectionSub")}</p>
          </Reveal>
          <div className="grid3">
            <Reveal>
              <div className="card usecase depth-fx">
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Handshake />
                  </div>
                  <h3 style={{ margin: 0 }}>{t("marketplace.sponsors.title")}</h3>
                </div>
                <p className="muted">{t("marketplace.sponsors.text")}</p>
                <Link href="/sponsors" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                  {t("marketplace.sponsors.cta")}
                </Link>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="card usecase depth-fx">
                <div className="usecase-head">
                  <div className="glass-icon">
                    <Camera />
                  </div>
                  <h3 style={{ margin: 0 }}>{t("marketplace.vendorsSearch.title")}</h3>
                </div>
                <p className="muted">{t("marketplace.vendorsSearch.text")}</p>
                <a href="/prestataires" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                  {t("marketplace.vendorsSearch.cta")}
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
                  <h3 style={{ margin: 0 }}>{t("marketplace.companies.title")}</h3>
                </div>
                <p className="muted">{t("marketplace.companies.text")}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <a href="/entreprise" className="btn btn-ghost btn-sm">
                    {t("marketplace.companies.ctaProfile")}
                  </a>
                  <a href="/opportunites" className="muted" style={{ fontSize: 13 }}>
                    {t("marketplace.companies.ctaOpportunities")}
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
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
          <Reveal>
            <span className="section-kicker">{t("faqSection.sectionKicker")}</span>
            <SplitTitle className="section-title">{t("faqSection.sectionTitle")}</SplitTitle>
          </Reveal>
          <div className="faq-list">
            {faqs.map((f, i) => {
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
