"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatDate, formatPrice } from "@/lib/api";

interface TicketPreviewProps {
  eventTitle: string;
  startsAt: string | null;
  venue?: string | null;
  categoryName: string;
  priceCents: number;
  currency?: string;
  onClose: () => void;
}

export function TicketPreview({
  eventTitle,
  startsAt,
  venue,
  categoryName,
  priceCents,
  currency = "CAD",
  onClose,
}: TicketPreviewProps) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL("EVENTGALO-APERCU", { width: 480, margin: 1 }).then(setQr);
  }, []);

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="card ticket-qr" style={{ margin: 0, position: "relative" }}>
          <span className="badge warn" style={{ position: "absolute", top: 12, right: 12 }}>
            Aperçu
          </span>
          <h2 style={{ margin: "0 0 4px" }}>{eventTitle || "Titre de l'événement"}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {startsAt ? formatDate(startsAt) : "Date à définir"}
            {venue ? ` · ${venue}` : ""}
          </p>
          <p>
            <span className="badge warn">{categoryName || "Catégorie"}</span>{" "}
            <span className="badge ok">{formatPrice(priceCents, currency)}</span>
          </p>
          {qr && <img src={qr} alt="Exemple de QR code" style={{ opacity: 0.85 }} />}
          <div className="serial">EG-0000-APERCU</div>
          <p className="muted">Nom de l&apos;acheteur</p>
          <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            Aperçu : c&apos;est à ceci que ressemblera le billet reçu par email après achat.
          </p>
        </div>
        <button className="btn-ghost" style={{ marginTop: 14 }} onClick={onClose}>
          Fermer l&apos;aperçu
        </button>
      </div>
    </div>
  );
}
