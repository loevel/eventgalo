"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, formatDate, formatPrice, getToken } from "@/lib/api";
import { WEB } from "./_components/shared";
import { AnnounceForm, AnnouncementCard, CollaboratorsCard, CopyField, DetailsCard, QuestionsCard } from "./_components/shared-cards";
import { GuestsTab } from "./_components/guests-tab";
import { MediaTab } from "./_components/media-tab";
import { CategoriesTab } from "./_components/categories-tab";
import { SellersTab } from "./_components/sellers-tab";
import { SponsorsTab } from "./_components/sponsors-tab";
import { ReportTab } from "./_components/report-tab";
import { PerformersTab } from "./_components/performers-tab";
import { WebhooksTab } from "./_components/webhooks-tab";

interface Detail {
  event: Record<string, any>;
  is_owner: boolean;
  guests: Array<Record<string, any>>;
  categories: Array<Record<string, any>>;
  sellers: Array<Record<string, any>>;
  seller_quotas: Array<Record<string, any>>;
  announcements: Array<Record<string, any>>;
  refund_requests: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
  waitlist: Array<Record<string, any>>;
  collaborators: Array<Record<string, any>>;
  sponsor_tiers: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
  performers: Array<Record<string, any>>;
  questions: Array<Record<string, any>>;
}


/**
 * Questions posées à l'assistant IA, celles restées sans réponse en tête.
 *
 * C'est le retour le plus direct que l'organisateur puisse avoir sur sa fiche :
 * chaque ligne « sans réponse » est une information que de vrais visiteurs sont
 * venus chercher et n'ont pas trouvée. On les montre dans l'aperçu, à côté des
 * prochaines étapes, parce que c'est là qu'on décide quoi faire ensuite.
 */



export default function EventAdmin() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [tab, setTab] = useState("apercu");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<Detail>(`/api/events/${id}`)
      .then(setData)
      .catch((e) => {
        if (e.status === 401) router.replace("/");
        else setError(e.message);
      });
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) router.replace("/");
    else reload();
  }, [reload, router]);

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setError(null);
    setFlash(null);
    try {
      await fn();
      if (okMsg) setFlash(okMsg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (!data) {
    return (
      <main className="container">
        {error ? <div className="alert err" role="alert">{error}</div> : <p className="muted">Chargement…</p>}
      </main>
    );
  }

  const { event: ev, is_owner, guests, categories, sellers, seller_quotas, announcements, refund_requests, sales, waitlist, collaborators, sponsor_tiers, sponsors, performers, questions } = data;
  const opened = guests.filter((g) => g.opened_at).length;
  const yes = guests.filter((g) => g.rsvp_status === "yes").length;
  const soldTotal = categories.reduce((s, c) => s + c.sold, 0);
  const revenue = sales.reduce((s, r) => s + (r.revenue_cents ?? 0), 0);

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>{ev.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              setError(null);
              try {
                const { event: copy } = await api<{ event: { id: string } }>(`/api/events/${ev.id}/duplicate`, {
                  method: "POST",
                });
                router.push(`/dashboard/e/${copy.id}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erreur");
              }
            }}
          >
            🧬 Dupliquer
          </button>
          <Link href={`/dashboard/e/${ev.id}/edit`} className="btn btn-ghost btn-sm">
            ✏️ Modifier
          </Link>
        </div>
      </div>
      <p className="muted">
        {formatDate(ev.starts_at)} {ev.venue ? `· ${ev.venue}` : ""} ·{" "}
        <span className={`badge ${ev.status === "archived" ? "mut" : "ok"}`}>
          {ev.type === "ticketed" ? "Billetterie" : "Privé"}
        </span>{" "}
        <span className={`badge ${ev.status === "published" ? "ok" : ev.status === "draft" ? "warn" : "mut"}`}>
          {ev.status === "published" ? "Publié" : ev.status === "draft" ? "Brouillon" : "Archivé"}
        </span>
      </p>

      <div className="card">
        <strong>Lien public à partager</strong>
        <CopyField value={`${WEB}/e/${ev.public_slug}`} />
      </div>

      {error && <div className="alert err" role="alert">{error}</div>}
      {flash && <div className="alert ok" role="status">{flash}</div>}

      <div className="tabs">
        {[
          ["apercu", "Aperçu"],
          ["invites", `Invités (${guests.length})`],
          ["annonces", "Annonces"],
          ["photos", "Photos"],
          ["sponsors", `Sponsors (${sponsors.filter((s) => s.status === "pending").length ? `${sponsors.filter((s) => s.status === "pending").length} à traiter` : sponsors.length})`],
          ["artistes", `Artistes (${performers.length})`],
          ["rapport", "Rapport"],
          ["integrations", "Intégrations"],
          ...(ev.type === "ticketed"
            ? ([
                ["billets", "Billetterie"],
                ["vendeurs", `Vendeurs & ventes (${sellers.length})`],
                ["remboursements", `Remboursements (${refund_requests.filter((r) => r.status === "pending").length})`],
                ["scan", "Scan"],
              ] as const)
            : []),
        ].map(([key, lbl]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "apercu" && (
        <>
          {(() => {
            const steps = [
              {
                done: Boolean(ev.description),
                label: "Ajoutez une description et un programme",
                action: () => router.push(`/dashboard/e/${ev.id}/edit`),
                actionLabel: "Modifier",
              },
              {
                done: Boolean(ev.cover_media_id),
                label: "Ajoutez une photo de couverture",
                action: () => setTab("photos"),
                actionLabel: "Ajouter une photo",
              },
              ev.type === "ticketed"
                ? {
                    done: categories.length > 0,
                    label: "Configurez au moins une catégorie de billets",
                    action: () => setTab("billets"),
                    actionLabel: "Configurer",
                  }
                : {
                    done: guests.length > 0,
                    label: "Invitez vos premiers invités",
                    action: () => setTab("invites"),
                    actionLabel: "Inviter",
                  },
              {
                done: ev.status === "published",
                label: "Publiez votre événement",
                action: () => act(() => api(`/api/events/${ev.id}`, { method: "PATCH", body: { status: "published" } }), "Événement publié"),
                actionLabel: "Publier",
              },
            ];
            const remaining = steps.filter((s) => !s.done);
            if (remaining.length === 0) return null;
            return (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Prochaines étapes</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Complétez ces quelques points pour que votre événement soit prêt.
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {steps.map((s, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "10px 0", borderBottom: i < steps.length - 1 ? "1px solid var(--line)" : "none",
                      }}
                    >
                      <span style={{ color: s.done ? "var(--muted)" : "var(--ink)", textDecoration: s.done ? "line-through" : "none" }}>
                        {s.done ? "✓" : "○"} {s.label}
                      </span>
                      {!s.done && (
                        <button type="button" className="btn-sm btn-ghost" onClick={s.action}>
                          {s.actionLabel}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <QuestionsCard questions={questions} onEdit={() => router.push(`/dashboard/e/${ev.id}/edit`)} />
          <div className="grid2">
            <div className="card stat">
              <div className="num">{yes}</div>
              <div className="lbl">Confirmés</div>
            </div>
            <div className="card stat">
              <div className="num">
                {opened}/{guests.length}
              </div>
              <div className="lbl">Liens ouverts</div>
            </div>
            {ev.type === "ticketed" && (
              <>
                <div className="card stat">
                  <div className="num">{soldTotal}</div>
                  <div className="lbl">Billets vendus / capacité {ev.capacity}</div>
                </div>
                <div className="card stat">
                  <div className="num">{formatPrice(revenue)}</div>
                  <div className="lbl">Revenus</div>
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Publication</h3>
            <p className="muted">
              {ev.status === "draft"
                ? "Cet événement est en brouillon : la page publique n'est pas visible."
                : ev.status === "published"
                  ? "Cet événement est publié et visible via son lien public."
                  : "Cet événement est archivé."}
            </p>
            {ev.status === "draft" && (
              <button
                className="btn-sm btn-accent"
                onClick={() => act(() => api(`/api/events/${ev.id}`, { method: "PATCH", body: { status: "published" } }), "Événement publié")}
              >
                Publier
              </button>
            )}
            {ev.status === "published" && (
              <>
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => act(() => api(`/api/events/${ev.id}`, { method: "PATCH", body: { status: "draft" } }), "Repassé en brouillon")}
                >
                  Repasser en brouillon
                </button>{" "}
              </>
            )}
            {ev.status === "published" && sponsor_tiers.length === 0 &&
              (!ev.starts_at || new Date(ev.starts_at).getTime() > Date.now()) && (
                <div className="alert info">
                  Astuce : cet événement n&apos;apparaît pas encore dans les{" "}
                  <a href="/opportunites" target="_blank" rel="noreferrer">événements à sponsoriser</a>. Créez au
                  moins un palier de sponsoring pour y figurer et recevoir des propositions d&apos;entreprises.{" "}
                  <button className="btn-sm btn-ghost" onClick={() => setTab("sponsors")}>
                    Créer un palier
                  </button>
                </div>
              )}
            {ev.status !== "archived" && (
              <button
                className="btn-sm btn-ghost"
                onClick={() => {
                  if (confirm("Archiver cet événement ? La page publique et les invitations ne seront plus accessibles.")) {
                    act(() => api(`/api/events/${ev.id}`, { method: "PATCH", body: { status: "archived" } }), "Événement archivé");
                  }
                }}
              >
                Archiver
              </button>
            )}
            {is_owner && (
              <button
                className="btn-sm btn-ghost"
                onClick={() => {
                  if (
                    confirm(
                      "Supprimer définitivement cet événement ? Cette action est irréversible et ne fonctionne que s'il n'a aucune vente ni sponsor confirmé.",
                    )
                  ) {
                    setError(null);
                    api(`/api/events/${ev.id}`, { method: "DELETE" })
                      .then(() => router.replace("/dashboard"))
                      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
                  }
                }}
              >
                Supprimer
              </button>
            )}
          </div>
          <DetailsCard ev={ev} />
          <CollaboratorsCard ev={ev} isOwner={is_owner} collaborators={collaborators} act={act} />
        </>
      )}

      {tab === "invites" && <GuestsTab eventId={ev.id} ev={ev} guests={guests} act={act} />}

      {tab === "annonces" && (
        <>
          <AnnounceForm eventId={ev.id} act={act} />
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} eventId={ev.id} announcement={a} act={act} />
          ))}
        </>
      )}

      {tab === "photos" && <MediaTab eventId={ev.id} coverId={ev.cover_media_id} logoId={ev.logo_media_id} act={act} />}

      {tab === "sponsors" && <SponsorsTab ev={ev} tiers={sponsor_tiers} sponsors={sponsors} act={act} />}
      {tab === "artistes" && <PerformersTab ev={ev} performers={performers} act={act} />}
      {tab === "rapport" && (
        <ReportTab
          categories={categories}
          sales={sales}
          refundRequests={refund_requests}
          waitlist={waitlist}
          sponsorTiers={sponsor_tiers}
          sponsors={sponsors}
        />
      )}
      {tab === "integrations" && <WebhooksTab eventId={ev.id} />}

      {tab === "billets" && <CategoriesTab ev={ev} categories={categories} waitlist={waitlist} act={act} />}

      {tab === "vendeurs" && (
        <SellersTab ev={ev} sellers={sellers} quotas={seller_quotas} categories={categories} sales={sales} act={act} />
      )}

      {tab === "remboursements" && (
        <>
          {refund_requests.length === 0 && <p className="muted">Aucune demande de remboursement.</p>}
          {refund_requests.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>
                    {r.buyer_name} — billet {r.serial} ({r.category_name}, {formatPrice(r.unit_cents, r.currency)})
                  </strong>
                  <p className="muted" style={{ margin: "4px 0" }}>
                    {r.reason || "Sans motif"} · {formatDate(r.created_at)}
                  </p>
                </div>
                {r.status === "pending" ? (
                  <div>
                    <button
                      className="btn-sm btn-accent"
                      onClick={() =>
                        act(
                          () =>
                            api(`/api/events/${ev.id}/refund-requests/${r.id}/decision`, {
                              method: "POST",
                              body: { approve: true },
                            }),
                          "Remboursement approuvé",
                        )
                      }
                    >
                      Approuver
                    </button>{" "}
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() =>
                        act(
                          () =>
                            api(`/api/events/${ev.id}/refund-requests/${r.id}/decision`, {
                              method: "POST",
                              body: { approve: false },
                            }),
                          "Demande refusée",
                        )
                      }
                    >
                      Refuser
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    <span className={`badge ${r.status === "approved" ? "ok" : "err"}`}>
                      {r.status === "approved" ? "Approuvé" : "Refusé"}
                    </span>
                    {r.status === "approved" && r.refund_amount_cents != null && (
                      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                        {formatPrice(r.refund_amount_cents, r.currency)} remboursé
                        {r.stripe_refund_id ? ` · Stripe ${r.stripe_refund_id}` : ""}
                      </p>
                    )}
                    {r.status === "approved" && r.stripe_error && (
                      <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, color: "var(--err, #c0392b)" }}>
                        Billet remboursé, mais le remboursement Stripe a échoué : {r.stripe_error}. À traiter manuellement.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "scan" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Contrôle à l&apos;entrée</h3>
          <p className="muted">
            Partagez ce lien avec vos contrôleurs : il ouvre la caméra et valide les billets en temps réel.
            Chaque billet ne peut être scanné qu&apos;une seule fois.
          </p>
          <CopyField value={`${WEB}/scan?key=${ev.scanner_key}`} />
          <a className="btn btn-accent" href={`/scan?key=${ev.scanner_key}`}>
            Ouvrir le scanner
          </a>
        </div>
      )}
    </main>
  );
}















