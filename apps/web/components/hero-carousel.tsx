"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Slide {
  image?: string;
  caption?: string;
}

const SLIDES: Slide[] = [
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
 */
export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0, 1]));
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoaded((prev) => {
      if (prev.has(index) && prev.has((index + 1) % SLIDES.length)) return prev;
      const next = new Set(prev);
      next.add(index);
      next.add((index + 1) % SLIDES.length);
      return next;
    });
  }, [index]);

  // Relancée sur navigation manuelle (go) pour que le compte à rebours reparte
  // à zéro au lieu d'entrer en concurrence avec le prochain avancement auto.
  function scheduleAutoplay() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timerRef.current = setInterval(() => {
      if (!pausedRef.current && !document.hidden) {
        setIndex((i) => (i + 1) % SLIDES.length);
      }
    }, AUTOPLAY_MS);
  }

  useEffect(() => {
    scheduleAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: number) {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
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
        {SLIDES.map((s, i) => (
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
        {SLIDES.map((_, i) => (
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
