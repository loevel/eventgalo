"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, formatDate } from "@/lib/api";
import { CheckoutForm } from "@/components/checkout-form";

export default function PublicEvent() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/public/events/${slug}`, { auth: false })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <main className="container narrow"><div className="alert err">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const ev = data.event;
  return (
    <main className="container narrow">
      <h1>{ev.title}</h1>
      <p className="muted">
        📅 {formatDate(ev.starts_at)}
        {ev.venue ? <><br />📍 {ev.venue}{ev.address ? `, ${ev.address}` : ""}</> : null}
        {ev.dress_code ? <><br />👗 Dress code : {ev.dress_code}</> : null}
      </p>
      {ev.description && (
        <div className="card">
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{ev.description}</p>
        </div>
      )}

      {(data.announcements as any[]).length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dernières annonces</h3>
          {(data.announcements as any[]).map((a, i) => (
            <p key={i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              {a.body} <span className="muted">— {formatDate(a.created_at)}</span>
            </p>
          ))}
        </div>
      )}

      {ev.type === "ticketed" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>🎟️ Billets</h2>
          <CheckoutForm slug={slug} categories={data.categories} />
        </div>
      )}
    </main>
  );
}
