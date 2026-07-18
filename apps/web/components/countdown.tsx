"use client";

import { useEffect, useState } from "react";

function timeLeft(target: number) {
  const diff = target - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes };
}

/** Petit compte à rebours en direct jusqu'au début de l'événement. */
export function Countdown({ startsAt }: { startsAt: string }) {
  const target = new Date(startsAt).getTime();
  const [left, setLeft] = useState(() => timeLeft(target));

  useEffect(() => {
    const id = setInterval(() => setLeft(timeLeft(target)), 60_000);
    return () => clearInterval(id);
  }, [target]);

  if (!left) return null;

  const parts = [
    { n: left.days, l: left.days === 1 ? "jour" : "jours" },
    { n: left.hours, l: left.hours === 1 ? "heure" : "heures" },
    { n: left.minutes, l: "min" },
  ];

  return (
    <div className="countdown" aria-label="Temps restant avant l'événement">
      {parts.map((p) => (
        <div key={p.l} className="countdown-part">
          <span className="countdown-num">{p.n}</span>
          <span className="countdown-lbl">{p.l}</span>
        </div>
      ))}
    </div>
  );
}
