"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 40; // ~2 min, marge pour la latence du webhook Stripe

interface TxResponse {
  transaction: { id: string; status: string; quantity: number; event_title: string; public_slug: string };
  tickets: Array<{ serial: string; url: string }>;
}

type State =
  | { kind: "static" }
  | { kind: "pending" }
  | { kind: "paid"; tickets: TxResponse["tickets"]; eventTitle: string }
  | { kind: "canceled"; slug: string }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

export default function CheckoutSuccess() {
  const [state, setState] = useState<State>({ kind: "pending" });
  const attempts = useRef(0);

  useEffect(() => {
    const tx = new URLSearchParams(window.location.search).get("tx");
    if (!tx) {
      setState({ kind: "static" });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function poll() {
      try {
        const res = await api<TxResponse>(`/api/public/transactions/${tx}`, { auth: false });
        if (stopped) return;
        if (res.transaction.status === "paid") {
          setState({ kind: "paid", tickets: res.tickets, eventTitle: res.transaction.event_title });
        } else if (res.transaction.status === "canceled") {
          setState({ kind: "canceled", slug: res.transaction.public_slug });
        } else if (attempts.current >= MAX_ATTEMPTS) {
          setState({ kind: "timeout" });
        } else {
          attempts.current += 1;
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        if (stopped) return;
        setState({
          kind: "error",
          message: e instanceof ApiError ? e.message : "Erreur de connexion — réessayez plus tard.",
        });
      }
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (state.kind === "pending") {
    return (
      <main className="container narrow">
        <div className="hero">
          <h1>⏳ Paiement en cours de confirmation…</h1>
          <p className="muted">Vos billets seront affichés ici dans quelques instants.</p>
        </div>
      </main>
    );
  }

  if (state.kind === "paid") {
    return (
      <main className="container narrow">
        <div className="hero">
          <h1>🎉 Paiement confirmé</h1>
          <p>
            Vos billets pour <strong>{state.eventTitle}</strong> sont prêts. Présentez le QR code à
            l&apos;entrée.
          </p>
        </div>
        <div className="alert ok" role="status">
          <strong>Billets émis !</strong> Un email de confirmation a aussi été envoyé.
          {state.tickets.map((t) => (
            <p key={t.serial}>
              <a href={t.url}>🎟️ Billet {t.serial}</a>
            </p>
          ))}
        </div>
      </main>
    );
  }

  if (state.kind === "canceled") {
    return (
      <main className="container narrow">
        <div className="alert err" role="alert">
          Le paiement n&apos;a pas abouti — la réservation a été annulée.{" "}
          <a href={`/e/${state.slug}`}>Retourner à la billetterie</a>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="container narrow">
        <div className="alert err" role="alert">
          {state.message} — <Link href="/">retour à l&apos;accueil</Link>
        </div>
      </main>
    );
  }

  // "timeout" et "static" : message générique (les billets arrivent par email)
  return (
    <main className="container narrow">
      <div className="hero">
        <h1>🎉 Paiement confirmé</h1>
        <p>
          Merci ! Vos billets sont en cours d&apos;émission — vous les recevrez par email dans quelques
          instants (vérifiez vos courriers indésirables).
        </p>
      </div>
    </main>
  );
}
