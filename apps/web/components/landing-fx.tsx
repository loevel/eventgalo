"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Parallax du hero au scroll : le contenu monte moins vite que la page et
 * s'estompe, l'indice « Découvrir » disparaît dès qu'on commence à défiler.
 */
export function HeroFx() {
  useEffect(() => {
    if (reduceMotion()) return;
    const ctx = gsap.context(() => {
      gsap.to(".landing-hero-content", {
        yPercent: 22,
        opacity: 0.15,
        ease: "none",
        scrollTrigger: { trigger: ".landing-hero", start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to(".hero-scroll-cue", {
        opacity: 0,
        y: 14,
        ease: "none",
        scrollTrigger: { trigger: ".landing-hero", start: "top top", end: "30% top", scrub: true },
      });
    });

    // Boutons magnétiques : les CTA suivent légèrement le curseur.
    const cleanups: Array<() => void> = [];
    if (window.matchMedia("(pointer: fine)").matches) {
      // Parallax du texte du hero : mouvement très subtil, à l'opposé du curseur —
      // couche la plus au premier plan, donc celle qui bouge le moins (l'anneau
      // 3D et les particules, plus en profondeur, réagissent davantage).
      const heroContent = document.querySelector<HTMLElement>(".landing-hero-content");
      const heroSection = document.querySelector<HTMLElement>(".landing-hero");
      if (heroContent && heroSection) {
        const toTextX = gsap.quickTo(heroContent, "x", { duration: 0.6, ease: "power3.out" });
        const toTextY = gsap.quickTo(heroContent, "y", { duration: 0.6, ease: "power3.out" });
        const onHeroMove = (e: PointerEvent) => {
          const r = heroSection.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          toTextX(-px * 12);
          toTextY(-py * 8);
        };
        const onHeroLeave = () => {
          toTextX(0);
          toTextY(0);
        };
        heroSection.addEventListener("pointermove", onHeroMove);
        heroSection.addEventListener("pointerleave", onHeroLeave);
        cleanups.push(() => {
          heroSection.removeEventListener("pointermove", onHeroMove);
          heroSection.removeEventListener("pointerleave", onHeroLeave);
        });
      }

      document.querySelectorAll<HTMLElement>(".cta-row .btn").forEach((btn) => {
        const toX = gsap.quickTo(btn, "x", { duration: 0.35, ease: "power3.out" });
        const toY = gsap.quickTo(btn, "y", { duration: 0.35, ease: "power3.out" });
        const onMove = (e: PointerEvent) => {
          const r = btn.getBoundingClientRect();
          toX((e.clientX - r.left - r.width / 2) * 0.28);
          toY((e.clientY - r.top - r.height / 2) * 0.4);
        };
        const onLeave = () => {
          toX(0);
          toY(0);
        };
        btn.addEventListener("pointermove", onMove);
        btn.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          btn.removeEventListener("pointermove", onMove);
          btn.removeEventListener("pointerleave", onLeave);
        });
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      ctx.revert();
    };
  }, []);
  return null;
}

/**
 * Titre dont les lettres montent en cascade (SplitText). `mode="load"` anime au
 * chargement (hero) ; `mode="scroll"` attend l'entrée dans le viewport.
 */
export function SplitTitle({
  as: Tag = "h2",
  className,
  mode = "scroll",
  children,
}: {
  as?: "h1" | "h2" | "h3";
  className?: string;
  mode?: "load" | "scroll";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const split = new SplitText(el, { type: "words,chars", wordsClass: "split-word", charsClass: "split-char" });
    const tween = gsap.from(split.chars, {
      yPercent: 110,
      opacity: 0,
      rotationX: -50,
      transformOrigin: "50% 100%",
      stagger: 0.02,
      duration: 0.75,
      ease: "back.out(1.4)",
      ...(mode === "load"
        ? { delay: 0.15 }
        : { scrollTrigger: { trigger: el, start: "top 85%", once: true } }),
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      split.revert();
    };
  }, [mode]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

/**
 * Storytelling au scroll pour les sections principales de la home (grille de
 * fonctionnalités, cas d'usage, section marketplace) : entrée en profondeur
 * avec un léger effet d'échelle, en plus du fade/translate déjà géré par
 * `Reveal`. Purement décoratif, aucune nouvelle dépendance — même pattern que
 * `HeroFx` (gsap.context + reduceMotion()).
 */
export function SectionDepthFx() {
  useEffect(() => {
    if (reduceMotion()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".depth-fx").forEach((el) => {
        gsap.from(el, {
          scale: 0.94,
          opacity: 0.5,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%", end: "top 55%", scrub: true },
        });
      });
    });
    return () => ctx.revert();
  }, []);
  return null;
}

/** Compteur animé (« 100% », « 3 min », « 0 ») déclenché à l'entrée dans le viewport. */
export function StatNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const match = /^(\d+)/.exec(value);
    if (!match || reduceMotion()) return; // pas de nombre ou motion réduite : texte statique
    const target = Number(match[1]);
    const suffix = value.slice(match[1].length);
    const counter = { n: target === 0 ? 9 : 0 }; // « 0 » fait un compte à rebours 9 → 0
    const tween = gsap.to(counter, {
      n: target,
      duration: 1.4,
      ease: "power2.out",
      snap: { n: 1 },
      paused: true,
      onUpdate: () => {
        el.textContent = `${counter.n}${suffix}`;
      },
    });
    const st = ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => tween.play() });
    return () => {
      st.kill();
      tween.kill();
    };
  }, [value]);

  return (
    <span className="hero-stat-num" ref={ref}>
      {value}
    </span>
  );
}

interface Speck {
  left: number;
  size: number;
  top: number;
}

/** Poussière d'or qui retombe du hero derrière la barre de stats. */
export function GoldDust() {
  const ref = useRef<HTMLDivElement>(null);
  const [specks, setSpecks] = useState<Speck[]>([]);

  // Générées côté client uniquement (aléatoire ⇒ pas de rendu serveur possible).
  useEffect(() => {
    if (reduceMotion()) return;
    setSpecks(
      Array.from({ length: 14 }, () => ({
        left: 2 + Math.random() * 96,
        size: 3 + Math.random() * 5,
        top: Math.random() * 100,
      })),
    );
  }, []);

  useEffect(() => {
    if (!specks.length || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".gold-dust span").forEach((s) => {
        gsap.to(s, {
          y: -(30 + Math.random() * 50),
          x: (Math.random() - 0.5) * 30,
          duration: 4 + Math.random() * 5,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: Math.random() * 4,
        });
        gsap.to(s, {
          opacity: 0.25 + Math.random() * 0.5,
          duration: 1.5 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: Math.random() * 3,
        });
      });
    }, ref);
    return () => ctx.revert();
  }, [specks]);

  return (
    <div className="gold-dust" ref={ref} aria-hidden="true">
      {specks.map((s, i) => (
        <span
          key={i}
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size }}
        />
      ))}
    </div>
  );
}

/** Trait doré qui relie les étapes 1 → 2 → 3 et se dessine au scroll. */
export function StepsPath() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!svg || !path) return;
    const length = path.getTotalLength();
    if (reduceMotion()) return; // trait affiché en entier
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    const ctx = gsap.context(() => {
      gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: { trigger: svg.parentElement, start: "top 78%", end: "center 45%", scrub: true },
      });
      gsap.from(".steps-wrap .step-num", {
        scale: 0.55,
        opacity: 0.25,
        stagger: 0.3,
        ease: "back.out(2)",
        scrollTrigger: { trigger: svg.parentElement, start: "top 78%", end: "center 45%", scrub: true },
      });
    }, svg.parentElement ?? undefined);
    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={svgRef}
      className="steps-path"
      viewBox="0 0 1000 70"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="steps-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9761f" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#d9a662" />
          <stop offset="1" stopColor="#c9761f" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        d="M 30 40 C 160 6, 300 62, 500 34 S 830 8, 970 40"
        fill="none"
        stroke="url(#steps-gold)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Inclinaison 3D subtile de la carte sous la souris (pointeurs fins uniquement). */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    gsap.set(el, { transformPerspective: 750 });
    const toRotX = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power2.out" });
    const toRotY = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power2.out" });

    function onMove(e: PointerEvent) {
      const r = el!.getBoundingClientRect();
      toRotX(-((e.clientY - r.top) / r.height - 0.5) * 16);
      toRotY(((e.clientX - r.left) / r.width - 0.5) * 20);
    }
    function onLeave() {
      toRotX(0);
      toRotY(0);
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`tilt${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

/**
 * Constellation dorée derrière la section marketplace : des points (associations,
 * entreprises) reliés quand ils se rapprochent — la mise en relation, en image.
 * Canvas 2D léger, en pause hors du viewport.
 */
export function ConstellationBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const NODES = 46;
    const LINK_DIST = 150;
    const nodes = Array.from({ length: NODES }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0006,
      r: 1.6 + Math.random() * 2.2,
    }));

    let w = 0;
    let h = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx2d!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function draw() {
      ctx2d!.clearRect(0, 0, w, h);
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;
      }
      for (let i = 0; i < NODES; i++) {
        for (let j = i + 1; j < NODES; j++) {
          const dx = (nodes[i].x - nodes[j].x) * w;
          const dy = (nodes[i].y - nodes[j].y) * h;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            ctx2d!.strokeStyle = `rgba(180, 120, 40, ${0.34 * (1 - d / LINK_DIST)})`;
            ctx2d!.lineWidth = 1;
            ctx2d!.beginPath();
            ctx2d!.moveTo(nodes[i].x * w, nodes[i].y * h);
            ctx2d!.lineTo(nodes[j].x * w, nodes[j].y * h);
            ctx2d!.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx2d!.fillStyle = "rgba(201, 118, 31, 0.65)";
        ctx2d!.beginPath();
        ctx2d!.arc(n.x * w, n.y * h, n.r, 0, Math.PI * 2);
        ctx2d!.fill();
      }
    }

    let frameId = 0;
    let running = false;
    function loop() {
      draw();
      frameId = requestAnimationFrame(loop);
    }

    if (reduceMotion()) {
      draw(); // une seule frame statique
      return () => ro.disconnect();
    }

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        frameId = requestAnimationFrame(loop);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(frameId);
      }
    });
    io.observe(parent);

    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={ref} className="constellation" aria-hidden="true" />;
}

/**
 * Frise géométrique inspirée des motifs perlés bamiléké (Ouest-Cameroun) :
 * chevrons entrelacés formant un lattis de losanges, utilisée comme séparateur
 * décoratif entre sections. Purement géométrique — aucune figure ni symbole
 * sacré, pour rester une décoration sans usurper un motif rituel.
 */
export function BamilekeDivider() {
  return (
    <svg
      className="bamileke-divider"
      viewBox="0 0 400 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern id="bamileke-tile" width="40" height="24" patternUnits="userSpaceOnUse">
          <path d="M0,20 L10,4 L20,20 L30,4 L40,20" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M0,4 L10,20 L20,4 L30,20 L40,4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="400" height="24" fill="url(#bamileke-tile)" />
    </svg>
  );
}

/**
 * L'araignée, motif signature de la place de marché : dans la tradition
 * grassfields du Cameroun (bamiléké, bamoun), la divination par araignée
 * (« ngam ») symbolise la sagesse du choix — un clin d'œil délibéré au thème
 * de la section (trouver le bon sponsor). Les pattes se dessinent au scroll,
 * comme le trait de StepsPath.
 */
export function SpiderMark() {
  const legsRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = legsRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    if (reduceMotion()) return; // pattes affichées en entier

    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    const ctx = gsap.context(() => {
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 1.1,
        ease: "power2.out",
        scrollTrigger: { trigger: path.closest("svg"), start: "top 80%", once: true },
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <svg className="spider-mark" viewBox="0 0 100 100" aria-hidden="true">
      <title>L&apos;araignée : symbole de sagesse (divination « ngam ») dans la tradition grassfields du Cameroun</title>
      <ellipse cx="50" cy="52" rx="13" ry="9" fill="currentColor" />
      <circle cx="36" cy="49" r="6" fill="currentColor" />
      <path
        ref={legsRef}
        d="M60,45 Q75,30 85,20 M60,48 Q78,38 92,35 M60,52 Q78,62 92,65 M60,55 Q75,70 85,80 M40,45 Q25,30 15,20 M40,48 Q22,38 8,35 M40,52 Q22,62 8,65 M40,55 Q25,70 15,80"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Rosettes de léopard stylisées (anneaux de petits cercles, jamais de figure
 * animale dessinée) : chez les chefferies bamiléké et bamoun, le port de la
 * peau de léopard était réservé aux chefs — un symbole de prestige et de
 * reconnaissance, discret clin d'œil pour les entreprises « reconnues » dans
 * l'annuaire.
 */
export function LeopardRosettes() {
  return (
    <svg className="leopard-rosettes" viewBox="0 0 120 60" aria-hidden="true">
      <title>Rosettes inspirées du léopard, symbole camerounais de prestige et de reconnaissance</title>
      <defs>
        <g id="rosette">
          <circle cx="0" cy="-8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="7" cy="-3" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="5" cy="6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="-5" cy="6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="-7" cy="-3" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="0" cy="0" r="1.6" fill="currentColor" />
        </g>
      </defs>
      <g transform="translate(20,18)"><use href="#rosette" /></g>
      <g transform="translate(60,42) scale(1.3)"><use href="#rosette" /></g>
      <g transform="translate(98,15) scale(0.8)"><use href="#rosette" /></g>
    </svg>
  );
}
