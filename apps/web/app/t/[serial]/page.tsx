"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { API_BASE, api, formatDate, formatPrice } from "@/lib/api";

export default function TicketPage() {
  const { serial } = useParams<{ serial: string }>();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refund, setRefund] = useState({ open: false, email: "", reason: "", done: false, err: "" });

  useEffect(() => {
    api(`/api/public/tickets/${serial}`, { auth: false })
      .then(async (d: any) => {
        setData(d);
        setQr(await QRCode.toDataURL(d.qr_payload, { width: 480, margin: 1 }));
      })
      .catch((e) => setError(e.message));
  }, [serial]);

  if (error) return <main className="container narrow"><div className="alert err">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const t = data.ticket;
  return (
    <main className="container narrow">
      <div className="card ticket-qr">
        <h2 style={{ margin: "0 0 4px" }}>{t.event_title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {formatDate(t.starts_at)}
          {t.venue ? ` · ${t.venue}` : ""}
        </p>
        <p>
          <span className="badge warn">{t.category_name}</span>{" "}
          <span className={`badge ${t.status === "valid" ? "ok" : t.status === "used" ? "mut" : "err"}`}>
            {t.status === "valid" ? "Valide" : t.status === "used" ? "Déjà utilisé" : "Remboursé/annulé"}
          </span>
        </p>
        {qr && t.status === "valid" && <img src={qr} alt={`QR code du billet ${t.serial}`} />}
        <div className="serial">{t.serial}</div>
        <p className="muted">{t.buyer_name}</p>
        <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          Billet nominatif à usage unique. Présentez ce QR code à l&apos;entrée.
        </p>
        <button className="btn-ghost no-print" onClick={() => window.print()}>
          🖨️ Imprimer / Enregistrer en PDF
        </button>{" "}
        <a className="btn-ghost btn-sm no-print" href={`${API_BASE}/api/public/tickets/${serial}/ics`}>
          📅 Agenda
        </a>
      </div>

      {t.status === "valid" && (
        <div className="card no-print">
          {!refund.open ? (
            <button className="btn-ghost btn-sm" onClick={() => setRefund({ ...refund, open: true })}>
              Demander un remboursement
            </button>
          ) : refund.done ? (
            <div className="alert ok">Demande envoyée. L&apos;organisateur va l&apos;examiner.</div>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Demande de remboursement</h3>
              <label>Email utilisé lors de l&apos;achat</label>
              <input type="email" value={refund.email} onChange={(e) => setRefund({ ...refund, email: e.target.value })} />
              <label>Motif (optionnel)</label>
              <textarea rows={2} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
              {refund.err && <div className="alert err">{refund.err}</div>}
              <button
                className="btn-accent"
                onClick={() =>
                  api(`/api/public/tickets/${serial}/refund-request`, {
                    method: "POST",
                    auth: false,
                    body: { email: refund.email, reason: refund.reason },
                  })
                    .then(() => setRefund({ ...refund, done: true }))
                    .catch((e) => setRefund({ ...refund, err: e.message }))
                }
              >
                Envoyer la demande
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
