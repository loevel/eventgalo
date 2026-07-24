"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://eventgalo-api.davechendjou.workers.dev";

interface Slide {
  image?: string;
  caption?: string;
}

interface HeroSlideApi {
  id: string;
  caption: string | null;
  has_image: boolean;
}

// Diapositives par défaut, affichées tant que l'admin n'a pas configuré son propre carrousel.
const DEFAULT_SLIDES: Slide[] = [
  {},
  { image: "/hero/gala-speaker.jpg", caption: "Galas & soirées corporatives" },
  { image: "/hero/networking.jpg", caption: "Sponsoring & mise en relation" },
  { caption: "Propulsé par l'IA" },
  { image: "/hero/florist.jpg", caption: "Décor & prestataires vérifiés" },
  { image: "/hero/table-decor.jpg", caption: "Une expérience soignée, dans les moindres détails" },
  { image: "/hero/catering.jpg", caption: "Traiteurs & gastronomie" },
  { image: "/hero/photographer.jpg", caption: "Photographes & prestataires de confiance" },
];

const AUTOPLAY_MS = 6000;

/**
 * Arrière-plan plein écran du hero : alterne diapositives photo et diapositives
 * « message » (dégradé de la charte, sans image). Remplace l'ancienne scène
 * Three.js — coût main-thread minimal (crossfade CSS, pas de boucle de rendu).
 * Les diapositives viennent de l'espace admin ; tant qu'aucune n'est configurée,
 * on retombe sur une sélection par défaut pour ne jamais afficher un hero vide.
 */
export function HeroCarousel() {
  const [slides, setSlides] = useState<Slide[]>(DEFAULT_SLIDES);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0, 1]));
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/hero-slides`)
      .then((r) => (r.ok ? r.json() : { slides: [] }))
      .then((data: { slides?: HeroSlideApi[] }) => {
        if (!data.slides || data.slides.length === 0) return;
        setSlides(
          data.slides.map((s) => ({
            image: s.has_image ? `${API_BASE}/api/public/hero-slides/${s.id}/image` : undefined,
            caption: s.caption ?? undefined,
          })),
        );
        setIndex(0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoaded((prev) => {
      if (prev.has(index) && prev.has((index + 1) % slides.length)) return prev;
      const next = new Set(prev);
      next.add(index);
      next.add((index + 1) % slides.length);
      return next;
    });
  }, [index, slides.length]);

  // Relancée sur navigation manuelle (go) pour que le compte à rebours reparte
  // à zéro au lieu d'entrer en concurrence avec le prochain avancement auto.
  function scheduleAutoplay() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timerRef.current = setInterval(() => {
      if (!pausedRef.current && !document.hidden) {
        setIndex((i) => (i + 1) % slides.length);
      }
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    scheduleAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  function go(next: number) {
    setIndex(((next % slides.length) + slides.length) % slides.length);
    scheduleAutoplay();
  }

  return (
    <>
      <div
        className="hero-carousel"
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        {slides.map((s, i) => (
          <div key={i} className={`hero-slide${i === index ? " active" : ""}`}>
            {s.image && loaded.has(i) && <img src={s.image} alt="" loading={i === 0 ? "eager" : "lazy"} />}
            {s.caption && <span className="hero-slide-caption">{s.caption}</span>}
          </div>
        ))}
      </div>
      <div className="hero-scrim" />
      <button type="button" className="hero-carousel-arrow prev" onClick={() => go(index - 1)} aria-label="Diapositive précédente">
        <ChevronLeft />
      </button>
      <button type="button" className="hero-carousel-arrow next" onClick={() => go(index + 1)} aria-label="Diapositive suivante">
        <ChevronRight />
      </button>
      <div className="hero-carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`hero-carousel-dot${i === index ? " active" : ""}`}
            onClick={() => go(i)}
            aria-label={`Aller à la diapositive ${i + 1}`}
          />
        ))}
      </div>
    </>
  );
}
