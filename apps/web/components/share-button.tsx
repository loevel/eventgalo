"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // annulé par l'utilisateur ou non supporté : on retombe sur la copie du lien
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" className="btn glass glass-btn" onClick={share}>
      {copied ? <Check /> : <Share2 />}
      {copied ? "Lien copié" : "Partager"}
    </button>
  );
}
