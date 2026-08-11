"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, MailOpen, Sparkles, TicketCheck, Wallet } from "lucide-react";
import { api, formatPrice, getToken } from "@/lib/api";
import { Reveal } from "@/components/reveal";

interface AnalyticsSummary {
  currency: string;
  invites: { total: number; opened: number };
  rsvp: { yes: number; no: number; pending: number };
  revenue_cents: number;
  tickets: { sold: number; used: number };
  monthly: Array<{ month: string; revenue_cents: number; attendance: number }>;
  vendors: Array<{ name: string; quota: number; sold: number; lastAt: string | null; lastAmount: number }>;
}

function pct(n: number, total: number): number | null {
  return total > 0 ? n / total : null;
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", { month: "short" }).format(new Date(y, m - 1, 1));
}

/** Résumé de vos statistiques en langage clair, généré à la demande via Workers AI. */
function AiSummaryCard() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ text: string }>("/api/analytics/summary", { method: "POST" });
      setText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={17} style={{ color: "var(--accent)" }} /> Résumé IA
        </h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
          {busy ? "Analyse en cours…" : text ? "Régénérer" : "Générer un résumé"}
        </button>
      </div>
      {text && (
        <div style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{text}</div>
      )}
      {error && <p className="alert err" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      {!text && !error && !busy && (
        <p className="muted" style={{ marginTop: 8 }}>
          Obtenez en un clic une lecture rapide de vos tendances et un point d&apos;attention à surveiller.
        </p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<AnalyticsSummary>("/api/analytics")
      .then(setData)
      .catch((e) => {
        if (e.status === 401) router.replace("/");
        else setError(e.message);
      });
  }, [router]);

  if (error) {
    return (
      <main className="container">
        <div className="alert err" role="alert">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Analyses</h1>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      </main>
    );
  }

  const noEvents = data.invites.total === 0 && data.tickets.sold === 0 && data.revenue_cents === 0;
  const openRate = pct(data.invites.opened, data.invites.total);
  const rsvpTotal = data.rsvp.yes + data.rsvp.no + data.rsvp.pending;
  const responseRate = pct(data.rsvp.yes + data.rsvp.no, rsvpTotal);
  const attendanceRate = pct(data.tickets.used, data.tickets.sold);

  const kpis = [
    { icon: MailOpen, value: fmtPct(openRate), label: `Taux d'ouverture invitations (${data.invites.opened}/${data.invites.total})` },
    { icon: CalendarCheck, value: fmtPct(responseRate), label: `Taux de réponse RSVP (${data.rsvp.yes + data.rsvp.no}/${rsvpTotal})` },
    { icon: Wallet, value: formatPrice(data.revenue_cents, data.currency), label: "Revenu brut (billetterie + sponsoring)" },
    { icon: TicketCheck, value: fmtPct(attendanceRate), label: `Taux de présence (${data.tickets.used}/${data.tickets.sold} scannés)` },
  ];

  const maxMonthly = Math.max(1, ...data.monthly.map((m) => m.revenue_cents));
  const donutTotal = Math.max(1, rsvpTotal);
  const yesDeg = (data.rsvp.yes / donutTotal) * 360;
  const noDeg = (data.rsvp.no / donutTotal) * 360;
  const donutGradient = `conic-gradient(var(--ok) 0deg ${yesDeg}deg, var(--err) ${yesDeg}deg ${yesDeg + noDeg}deg, var(--line) ${yesDeg + noDeg}deg 360deg)`;

  return (
    <main className="container">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Analyses</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Vue d&apos;ensemble de tous vos événements.
      </p>

      {noEvents ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p className="muted">Pas encore de données : créez et publiez un événement pour voir vos analyses.</p>
        </div>
      ) : (
        <>
          <Reveal>
            <div className="analytics-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="card analytics-kpi">
                  <k.icon size={20} style={{ color: "var(--accent)" }} />
                  <div>
                    <div className="analytics-kpi-value">{k.value}</div>
                    <div className="analytics-kpi-label">{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={40}>
            <AiSummaryCard />
          </Reveal>

          <div className="grid2" style={{ marginTop: 20, alignItems: "start" }}>
            <Reveal>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Tendance mensuelle</h3>
                {data.monthly.every((m) => m.revenue_cents === 0 && m.attendance === 0) ? (
                  <p className="muted">Pas encore de ventes ni de présences enregistrées.</p>
                ) : (
                  <div className="analytics-bars">
                    {data.monthly.map((m) => (
                      <div key={m.month} className="analytics-bar-col">
                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar"
                            style={{ height: `${Math.max(4, (m.revenue_cents / maxMonthly) * 100)}%` }}
                            title={`${formatPrice(m.revenue_cents, data.currency)} — ${m.attendance} présence${m.attendance > 1 ? "s" : ""}`}
                          />
                        </div>
                        <span className="analytics-bar-label">{monthLabel(m.month)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Répartition RSVP</h3>
                {rsvpTotal === 0 ? (
                  <p className="muted">Aucun invité pour le moment.</p>
                ) : (
                  <div className="analytics-donut-wrap">
                    <div className="analytics-donut" style={{ background: donutGradient }} />
                    <div className="analytics-donut-legend">
                      <span><i style={{ background: "var(--ok)" }} /> Confirmés ({data.rsvp.yes})</span>
                      <span><i style={{ background: "var(--err)" }} /> Déclinés ({data.rsvp.no})</span>
                      <span><i style={{ background: "var(--line)" }} /> En attente ({data.rsvp.pending})</span>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Suivi par vendeur</h3>
              {data.vendors.length === 0 ? (
                <p className="muted">Aucun vendeur assigné pour le moment.</p>
              ) : (
                <div className="analytics-vendors">
                  {data.vendors.map((v) => (
                    <div key={v.name + (v.lastAt ?? "")} className="analytics-vendor-card">
                      <span className="sponsor-name-fallback">{v.name.charAt(0).toUpperCase()}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {v.sold}/{v.quota} vendus ({fmtPct(pct(v.sold, v.quota))})
                        </div>
                        <div className="analytics-vendor-track">
                          <div className="analytics-vendor-fill" style={{ width: `${Math.min(100, (v.sold / Math.max(1, v.quota)) * 100)}%` }} />
                        </div>
                      </div>
                      {v.lastAt && (
                        <div className="muted" style={{ fontSize: 12, textAlign: "right", flex: "none" }}>
                          Dernière vente
                          <br />
                          {formatPrice(v.lastAmount, data.currency)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </>
      )}
    </main>
  );
}
