"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/** Note moyenne en lecture seule (annuaire, listes). */
export function Stars({ value, count, size = 13 }: { value: number; count?: number; size?: number }) {
  return (
    <span className="stars" title={`${value} / 5${count != null ? ` (${count} avis)` : ""}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(value) ? "currentColor" : "none"}
          strokeWidth={1.5}
        />
      ))}
      <span className="stars-value">
        {value}
        {count != null && <span className="muted"> ({count})</span>}
      </span>
    </span>
  );
}

/** Saisie d'une note 1–5 avec commentaire optionnel (évaluations mutuelles). */
export function RatingForm({
  initialRating,
  initialComment,
  busy,
  onSubmit,
  label = "Envoyer mon évaluation",
}: {
  initialRating?: number | null;
  initialComment?: string | null;
  busy?: boolean;
  onSubmit: (rating: number, comment: string) => void;
  label?: string;
}) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initialComment ?? "");

  return (
    <div>
      <div className="stars-input" role="radiogroup" aria-label="Note sur 5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
          >
            <Star size={22} fill={i <= (hover || rating) ? "currentColor" : "none"} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        maxLength={800}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (optionnel)"
        style={{ marginTop: 8 }}
      />
      <button
        type="button"
        className="btn-accent btn-sm"
        disabled={busy || rating < 1}
        onClick={() => onSubmit(rating, comment)}
        style={{ marginTop: 8 }}
      >
        {busy ? "Envoi…" : label}
      </button>
    </div>
  );
}
