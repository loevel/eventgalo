"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CalendarDays, Check, MapPin, Sparkles } from "lucide-react";
import { formatDate, formatPrice } from "@/lib/api";

interface TicketPreviewProps {
  eventTitle: string;
  startsAt: string | null;
  venue?: string | null;
  categoryName: string;
  priceCents: number;
  perks?: string[];
  currency?: string;
  onClose: () => void;
}

/** Aperçu organisateur : reproduit le rendu réel de la page billet. */
export function TicketPreview({
  eventTitle,
  startsAt,
  venue,
  categoryName,
  priceCents,
  perks = [],
  currency = "CAD",
  onClose,
}: TicketPreviewProps) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL("EVENTGALO-APERCU", { width: 480, margin: 1 }).then(setQr);
  }, []);

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="ticket-shell" style={{ margin: 0, position: "relative", width: "100%" }}>
          <span className="badge warn" style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
            Aperçu
          </span>
          <div className="ticket-head">
            <span className="ticket-brand">
              Event<em>Galo</em>
            </span>
            <h2 className="ticket-title">{eventTitle || "Titre de l'événement"}</h2>
            <div className="ticket-meta">
              <span>
                <CalendarDays /> {startsAt ? formatDate(startsAt) : "Date à définir"}
              </span>
              {venue && (
                <span>
                  <MapPin /> {venue}
                </span>
              )}
            </div>
            <div className="ticket-badges">
              <span className="ticket-cat">{categoryName || "Catégorie"}</span>
              <span className="badge ok">{formatPrice(priceCents, currency)}</span>
            </div>
          </div>
          <div className="ticket-perf" aria-hidden="true" />
          <div className="ticket-body">
            {qr && (
              <div className="ticket-qr-frame">
                <img src={qr} alt="Exemple de QR code" style={{ opacity: 0.85 }} />
              </div>
            )}
            <div className="serial">EG-0000-APERCU</div>
            <p className="ticket-holder">Nom de l&apos;acheteur</p>
            {perks.length > 0 && (
              <div className="ticket-perks">
                <h3>
                  <Sparkles /> Inclus avec votre billet {categoryName || ""}
                </h3>
                <ul>
                  {perks.map((p, i) => (
                    <li key={i} style={{ animationDelay: `${0.55 + i * 0.09}s` }}>
                      <Check /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="muted ticket-note">
              Aperçu : c&apos;est à ceci que ressemblera le billet reçu par email après achat.
            </p>
          </div>
        </div>
        <button className="btn-ghost" style={{ marginTop: 14 }} onClick={onClose}>
          Fermer l&apos;aperçu
        </button>
      </div>
    </div>
  );
}
