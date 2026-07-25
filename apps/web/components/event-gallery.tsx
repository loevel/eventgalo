"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface EventGalleryProps {
  images: { id: string; src: string }[];
}

/**
 * Galerie publique : un visualiseur principal (piste défilante en scroll-snap)
 * avec vignettes cliquables sous desktop. Sur mobile, les vignettes s'effacent
 * et la piste devient directement le geste de swipe — pas de clic requis pour
 * changer de photo, juste glisser le doigt, avec des puces pour se repérer.
 */
export function EventGallery({ images }: EventGalleryProps) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const i = slideRefs.current.findIndex((el) => el === mostVisible.target);
        if (i !== -1) setIndex(i);
      },
      { root: track, threshold: 0.6 },
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [images.length]);

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(images.length - 1, i));
    slideRefs.current[clamped]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  if (images.length === 0) return null;

  return (
    <div className="event-gallery">
      <div className="event-gallery-main">
        <div className="event-gallery-track" ref={trackRef}>
          {images.map((img, i) => (
            <div
              key={img.id}
              className="event-gallery-slide"
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
            >
              <img src={img.src} alt="" loading={i === 0 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button
              type="button"
              className="event-gallery-arrow prev"
              onClick={() => goTo(index - 1)}
              aria-label="Photo précédente"
              disabled={index === 0}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="event-gallery-arrow next"
              onClick={() => goTo(index + 1)}
              aria-label="Photo suivante"
              disabled={index === images.length - 1}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <>
          <div className="event-gallery-thumbs">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                className={`event-gallery-thumb${i === index ? " active" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Voir la photo ${i + 1}`}
              >
                <img src={img.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="event-gallery-dots">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`event-gallery-dot${i === index ? " active" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Aller à la photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
