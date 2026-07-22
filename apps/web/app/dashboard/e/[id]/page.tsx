"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE, api, formatDate, formatPrice, getToken } from "@/lib/api";
import { MediaGallery, type MediaItem } from "@/components/media-gallery";
import { TicketPreview } from "@/components/ticket-preview";
import { RatingForm, Stars } from "@/components/star-rating";
import { parsePerks } from "@/lib/perks";
import { PERFORMER_ROLES } from "@/lib/sponsor";

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
}

const WEB = typeof window !== "undefined" ? window.location.origin : "";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        className="btn-sm btn-ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓" : "Copier"}
      </button>
    </div>
  );
}

function CollaboratorsCard({
  ev, isOwner, collaborators, act,
}: {
  ev: Record<string, any>;
  isOwner: boolean;
  collaborators: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [email, setEmail] = useState("");
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Organisateurs</h3>
      <p className="muted">Les co-organisateurs ont un accès complet à cet événement (invités, billetterie, annonces…).</p>
      {collaborators.length > 0 && (
        <ul style={{ paddingLeft: 20 }}>
          {collaborators.map((cb) => (
            <li key={cb.id} style={{ marginBottom: 4 }}>
              {cb.name || cb.email}{" "}
              {isOwner && (
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => act(() => api(`/api/events/${ev.id}/collaborators/${cb.id}`, { method: "DELETE" }), "Co-organisateur retiré")}
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner ? (
        <div className="copy-row">
          <input
            type="email"
            placeholder="email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn-sm btn-accent"
            disabled={!email}
            onClick={() => {
              act(() => api(`/api/events/${ev.id}/collaborators`, { method: "POST", body: { email } }), "Co-organisateur ajouté");
              setEmail("");
            }}
          >
            Ajouter
          </button>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Seul l&apos;organisateur principal peut gérer les co-organisateurs.</p>
      )}
    </div>
  );
}

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
        {error ? <div className="alert err">{error}</div> : <p className="muted">Chargement…</p>}
      </main>
    );
  }

  const { event: ev, is_owner, guests, categories, sellers, seller_quotas, announcements, refund_requests, sales, waitlist, collaborators, sponsor_tiers, sponsors, performers } = data;
  const opened = guests.filter((g) => g.opened_at).length;
  const yes = guests.filter((g) => g.rsvp_status === "yes").length;
  const no = guests.filter((g) => g.rsvp_status === "no").length;
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

      {error && <div className="alert err">{error}</div>}
      {flash && <div className="alert ok">{flash}</div>}

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
            <div className="card" key={a.id}>
              <p style={{ margin: 0 }}>{a.body}</p>
              <span className="muted">{formatDate(a.created_at)}</span>
            </div>
          ))}
        </>
      )}

      {tab === "photos" && <MediaTab eventId={ev.id} coverId={ev.cover_media_id} logoId={ev.logo_media_id} act={act} />}

      {tab === "sponsors" && <SponsorsTab ev={ev} tiers={sponsor_tiers} sponsors={sponsors} act={act} />}
      {tab === "artistes" && <PerformersTab ev={ev} performers={performers} act={act} />}
      {tab === "rapport" && (
        <ReportTab
          ev={ev}
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

function GuestsTab({
  eventId, ev, guests, act,
}: {
  eventId: string;
  ev: Record<string, any>;
  guests: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [bulk, setBulk] = useState("");
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [rsvpQuestion, setRsvpQuestion] = useState(ev.rsvp_question ?? "");
  const hasGuardians = guests.some((g) => g.guardian_name);
  const hasNotes = guests.some((g) => g.rsvp_note);

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Question RSVP</h3>
        <p className="muted">
          Affichée aux invités quand ils confirment leur présence — utile pour les allergies, un besoin de
          transport, etc.
        </p>
        {editingQuestion ? (
          <>
            <input
              value={rsvpQuestion}
              onChange={(e) => setRsvpQuestion(e.target.value)}
              placeholder="Allergies alimentaires ou informations utiles ?"
            />
            <button
              className="btn-sm btn-accent"
              onClick={() => {
                act(
                  () => api(`/api/events/${eventId}`, { method: "PATCH", body: { rsvp_question: rsvpQuestion || null } }),
                  "Question RSVP enregistrée",
                );
                setEditingQuestion(false);
              }}
            >
              Enregistrer
            </button>{" "}
            <button className="btn-sm btn-ghost" onClick={() => setEditingQuestion(false)}>
              Annuler
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: "4px 0" }}>{ev.rsvp_question || <span className="muted">Aucune question définie.</span>}</p>
            <button className="btn-sm btn-ghost" onClick={() => setEditingQuestion(true)}>
              {ev.rsvp_question ? "Modifier" : "+ Ajouter une question"}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter des invités</h3>
        <p className="muted">
          Un invité par ligne : Nom, email (optionnel), table (optionnel), contact/parent (optionnel — utile pour
          inviter les enfants de camarades via leurs parents).
        </p>
        <textarea
          rows={4}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"Awa Diop, awa@exemple.com, Table 3\nLéa Martin, maman.lea@exemple.com, , Sophie Martin (maman)"}
        />
        <button
          className="btn-accent"
          onClick={() => {
            const list = bulk
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                const [name, email, table_name, guardian_name] = l.split(",").map((s) => s.trim());
                return { name, email: email || null, table_name: table_name || null, guardian_name: guardian_name || null };
              });
            if (list.length) {
              act(() => api(`/api/events/${eventId}/guests`, { method: "POST", body: { guests: list } }), `${list.length} invité(s) ajouté(s)`);
              setBulk("");
            }
          }}
        >
          Ajouter et envoyer les invitations
        </button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              {hasGuardians && <th>Parent / contact</th>}
              <th>Table</th>
              <th>Ouvert</th>
              <th>RSVP</th>
              {hasNotes && <th>Réponse</th>}
              <th>Lien</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.name}
                  {g.email ? <div className="muted">{g.email}</div> : null}
                </td>
                {hasGuardians && <td>{g.guardian_name ?? "—"}</td>}
                <td>{g.table_name ?? "—"}</td>
                <td>{g.opened_at ? "✓" : "—"}</td>
                <td>
                  <span className={`badge ${g.rsvp_status === "yes" ? "ok" : g.rsvp_status === "no" ? "err" : "mut"}`}>
                    {g.rsvp_status === "yes" ? "Confirmé" : g.rsvp_status === "no" ? "Décliné" : "En attente"}
                  </span>
                </td>
                {hasNotes && <td>{g.rsvp_note ?? "—"}</td>}
                <td>
                  <button className="btn-sm btn-ghost" onClick={() => navigator.clipboard.writeText(`${WEB}/i/${g.token}`)}>
                    Copier
                  </button>
                </td>
                <td>
                  <button
                    className="btn-sm btn-ghost"
                    onClick={() => {
                      if (confirm(`Supprimer ${g.name} ?`)) {
                        act(() => api(`/api/events/${eventId}/guests/${g.id}`, { method: "DELETE" }), "Invité supprimé");
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MediaTab({
  eventId, coverId, logoId, act,
}: {
  eventId: string;
  coverId: string | null;
  logoId: string | null;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ media: MediaItem[] }>(`/api/events/${eventId}/media`)
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e.message));
  }, [eventId]);

  useEffect(load, [load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/events/${eventId}/media`, { method: "POST", body: fd });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter une photo</h3>
        <p className="muted">Les photos sont visibles par tous les invités sur leur page d&apos;invitation.</p>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {uploading && <p className="muted">Envoi en cours…</p>}
        {error && <div className="alert err">{error}</div>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Galerie</h3>
        <p className="muted">
          La <strong>couverture</strong> s&apos;affiche en grand sur la page publique. Le <strong>logo</strong> de
          votre association apparaît sur la page, les billets, les invitations et dans tous les emails. Les photos
          marquées <strong>page publique</strong> forment la galerie « En images » visible par les acheteurs.
        </p>
        {media === null ? (
          <p className="muted">Chargement…</p>
        ) : (
          <MediaGallery
            media={media}
            canDelete={() => true}
            onDelete={(m) => {
              act(() => api(`/api/events/${eventId}/media/${m.id}`, { method: "DELETE" }), "Photo supprimée");
              setMedia((list) => list?.filter((x) => x.id !== m.id) ?? null);
            }}
            coverId={coverId}
            onSetCover={(m) =>
              act(
                () => api(`/api/events/${eventId}/cover`, { method: "PATCH", body: { media_id: m?.id ?? null } }),
                m ? "Image de couverture définie" : "Image de couverture retirée",
              )
            }
            logoId={logoId}
            onSetLogo={(m) =>
              act(
                () => api(`/api/events/${eventId}/logo`, { method: "PATCH", body: { media_id: m?.id ?? null } }),
                m ? "Logo défini" : "Logo retiré",
              )
            }
            onToggleFeatured={(m, featured) => {
              act(
                () => api(`/api/events/${eventId}/media/${m.id}`, { method: "PATCH", body: { featured } }),
                featured ? "Photo ajoutée à la page publique" : "Photo masquée de la page publique",
              );
              setMedia((list) => list?.map((x) => (x.id === m.id ? { ...x, featured: featured ? 1 : 0 } : x)) ?? null);
            }}
          />
        )}
      </div>
    </>
  );
}

function DetailsCard({ ev }: { ev: Record<string, any> }) {
  const agenda: Array<{ time: string; label: string }> = (() => {
    try {
      return ev.agenda ? JSON.parse(ev.agenda) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ marginTop: 0 }}>Détails</h3>
        <Link href={`/dashboard/e/${ev.id}/edit`} className="btn-sm btn-ghost">Modifier</Link>
      </div>
      <p className="muted">
        {ev.description || "Pas de description."}
        {ev.dress_code ? ` · Dress code : ${ev.dress_code}` : ""}
      </p>
      {agenda.length > 0 && (
        <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
          {agenda.map((item, i) => (
            <li key={i} className="muted" style={{ fontSize: 13, padding: "3px 0" }}>
              <strong style={{ color: "var(--ink)" }}>{item.time}</strong> — {item.label}
            </li>
          ))}
        </ul>
      )}
      <a
        className="btn btn-ghost btn-sm"
        href={`${API_BASE}/api/events/${ev.id}/export`}
        onClick={(e) => {
          e.preventDefault();
          fetch(`${API_BASE}/api/events/${ev.id}/export`, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then((r) => r.blob())
            .then((b) => {
              const url = URL.createObjectURL(b);
              const a = document.createElement("a");
              a.href = url;
              a.download = `eventgalo-export-${ev.public_slug}.json`;
              a.click();
            });
        }}
      >
        ⬇ Exporter les données (JSON)
      </a>
    </div>
  );
}

function AnnounceForm({ eventId, act }: { eventId: string; act: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const [body, setBody] = useState("");
  const [hint, setHint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  async function generate() {
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>(`/api/events/${eventId}/ai/draft`, {
        method: "POST",
        body: { target: "announcement", hint },
      });
      setBody(res.text);
    } catch {
      // L'erreur s'affiche déjà via le flux act() ailleurs ; ici on échoue silencieusement.
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Nouvelle annonce</h3>
      <p className="muted">Visible sur toutes les invitations, et envoyée par email aux invités.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="De quoi parle l'annonce ? (ex. changement d'horaire)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-sm btn-ghost" onClick={generate} disabled={aiBusy}>
          {aiBusy ? "Génération…" : "✨ Générer avec l'IA"}
        </button>
      </div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Changement d'horaire : ouverture des portes à 19h." />
      <button
        className="btn-accent"
        onClick={() => {
          if (body.trim()) {
            act(() => api(`/api/events/${eventId}/announcements`, { method: "POST", body: { body } }), "Annonce publiée");
            setBody("");
          }
        }}
      >
        Publier
      </button>
    </div>
  );
}

function CategoriesTab({
  ev, categories, waitlist, act,
}: {
  ev: Record<string, any>;
  categories: Array<Record<string, any>>;
  waitlist: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [form, setForm] = useState({ name: "", price: "", quantity: "", perks: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; price: string; quantity: string; perks: string } | null>(null);
  const [preview, setPreview] = useState<{ name: string; priceCents: number; perks: string[] } | null>(null);
  const [openWaitlist, setOpenWaitlist] = useState<string | null>(null);
  const allocated = categories.reduce((s, c) => s + c.quantity, 0);
  return (
    <>
      {preview && (
        <TicketPreview
          eventTitle={ev.title}
          startsAt={ev.starts_at}
          venue={ev.venue}
          categoryName={preview.name}
          priceCents={preview.priceCents}
          perks={preview.perks}
          onClose={() => setPreview(null)}
        />
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>
          Catégories <span className="muted">({allocated}/{ev.capacity} places allouées)</span>
        </h3>
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Prix</th>
              <th>Vendus</th>
              <th>Restants</th>
              <th>Attente</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) =>
              editing && editing.id === c.id ? (
                <React.Fragment key={c.id}>
                <tr>
                  <td>
                    <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editing.price}
                      onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                    />
                  </td>
                  <td>
                    {c.sold}/
                    <input
                      type="number"
                      min={c.sold}
                      style={{ width: 80, display: "inline-block" }}
                      value={editing.quantity}
                      onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                    />
                  </td>
                  <td>{c.quantity - c.sold}</td>
                  <td>{waitlist.filter((w) => w.category_id === c.id).length}</td>
                  <td>
                    <button
                      className="btn-sm btn-accent"
                      onClick={() => {
                        act(
                          () =>
                            api(`/api/events/${ev.id}/categories/${c.id}`, {
                              method: "PATCH",
                              body: {
                                name: editing.name,
                                price_cents: Math.round(Number(editing.price || 0) * 100),
                                quantity: Number(editing.quantity),
                                perks: editing.perks.split("\n").map((p) => p.trim()).filter(Boolean),
                              },
                            }),
                          "Catégorie modifiée",
                        );
                        setEditing(null);
                      }}
                    >
                      Enregistrer
                    </button>{" "}
                    <button className="btn-sm btn-ghost" onClick={() => setEditing(null)}>
                      Annuler
                    </button>
                  </td>
                </tr>
                <tr>
                  <td colSpan={6}>
                    <label style={{ marginTop: 0 }}>Avantages inclus (un par ligne)</label>
                    <textarea
                      rows={4}
                      value={editing.perks}
                      onChange={(e) => setEditing({ ...editing, perks: e.target.value })}
                      placeholder={"3 bouteilles de vin rouge\n2 bouteilles de whisky 12 ans d'âge\n4 bouteilles d'eau"}
                    />
                  </td>
                </tr>
                </React.Fragment>
              ) : (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {parsePerks(c.perks).length > 0 && (
                      <span className="muted" style={{ display: "block", fontSize: 12 }}>
                        {parsePerks(c.perks).length} avantage{parsePerks(c.perks).length > 1 ? "s" : ""} inclus
                      </span>
                    )}
                  </td>
                  <td>{formatPrice(c.price_cents, c.currency)}</td>
                  <td>
                    {c.sold}/{c.quantity}
                  </td>
                  <td>{c.quantity - c.sold}</td>
                  <td>
                    {waitlist.filter((w) => w.category_id === c.id).length > 0 ? (
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() => setOpenWaitlist(openWaitlist === c.id ? null : c.id)}
                      >
                        {waitlist.filter((w) => w.category_id === c.id).length}
                      </button>
                    ) : (
                      0
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => setPreview({ name: c.name, priceCents: c.price_cents, perks: parsePerks(c.perks) })}
                    >
                      👁️ Aperçu
                    </button>{" "}
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          price: String(c.price_cents / 100),
                          quantity: String(c.quantity),
                          perks: parsePerks(c.perks).join("\n"),
                        })
                      }
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {openWaitlist &&
          (() => {
            const cat = categories.find((c) => c.id === openWaitlist);
            const entries = waitlist.filter((w) => w.category_id === openWaitlist);
            return (
              <div style={{ marginTop: 16 }}>
                <h4>Liste d&apos;attente — {cat?.name}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Email</th>
                      <th>Inscrit le</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((w) => (
                      <tr key={w.id}>
                        <td>{w.name}</td>
                        <td>{w.email}</td>
                        <td>{formatDate(w.created_at)}</td>
                        <td>{w.notified_at ? "Prévenu·e" : "En attente"}</td>
                        <td>
                          <button
                            className="btn-sm btn-ghost"
                            onClick={() =>
                              act(
                                () => api(`/api/events/${ev.id}/waitlist/${w.id}`, { method: "DELETE" }),
                                "Retiré de la liste d'attente",
                              )
                            }
                          >
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter une catégorie</h3>
        <div className="grid2">
          <div>
            <label>Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VIP" />
          </div>
          <div>
            <label>Prix (CAD, 0 = gratuit)</label>
            <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <label>Quantité</label>
        <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <label>Avantages inclus (un par ligne, optionnel)</label>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Affichés sur la page de l&apos;événement et sur le billet — bouteilles incluses, accès loge, repas, etc.
        </p>
        <textarea
          rows={4}
          value={form.perks}
          onChange={(e) => setForm({ ...form, perks: e.target.value })}
          placeholder={"3 bouteilles de vin rouge\n2 bouteilles de whisky 12 ans d'âge\n4 bouteilles d'eau"}
        />
        <button
          className="btn-accent"
          onClick={() => {
            act(
              () =>
                api(`/api/events/${ev.id}/categories`, {
                  method: "POST",
                  body: {
                    name: form.name,
                    price_cents: Math.round(Number(form.price || 0) * 100),
                    quantity: Number(form.quantity),
                    perks: form.perks.split("\n").map((p) => p.trim()).filter(Boolean),
                  },
                }),
              "Catégorie créée",
            );
            setForm({ name: "", price: "", quantity: "", perks: "" });
          }}
        >
          Créer
        </button>{" "}
        <button
          type="button"
          className="btn-ghost"
          disabled={!form.name}
          onClick={() =>
            setPreview({
              name: form.name,
              priceCents: Math.round(Number(form.price || 0) * 100),
              perks: form.perks.split("\n").map((p) => p.trim()).filter(Boolean),
            })
          }
        >
          👁️ Aperçu du billet
        </button>
      </div>
    </>
  );
}

function SellersTab({
  ev, sellers, quotas, categories, sales, act,
}: {
  ev: Record<string, any>;
  sellers: Array<Record<string, any>>;
  quotas: Array<Record<string, any>>;
  categories: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [q, setQ] = useState<Record<string, string>>({});

  const ticketCount = (rows: Array<Record<string, any>>) => rows.reduce((t, x) => t + (x.count ?? 0), 0);
  const revenueOf = (rows: Array<Record<string, any>>) => rows.reduce((t, x) => t + (x.revenue_cents ?? 0), 0);

  const directSales = sales.filter((x) => !x.seller_id);
  const directCount = ticketCount(directSales);
  const totalCount = ticketCount(sales);
  const totalRevenue = revenueOf(sales);

  const ranked = [...sellers]
    .map((s) => {
      const mySales = sales.filter((x) => x.seller_id === s.id);
      const myQuotas = quotas.filter((x) => x.seller_id === s.id);
      const quotaTotal = myQuotas.reduce((t, x) => t + x.quota, 0);
      const quotaSold = myQuotas.reduce((t, x) => t + x.sold, 0);
      return {
        seller: s,
        myQuotas,
        count: ticketCount(mySales),
        revenue: revenueOf(mySales),
        quotaTotal,
        quotaSold,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

  return (
    <>
      {(sellers.length > 0 || totalCount > 0) && (
        <div className="grid3">
          <div className="card stat">
            <div className="num">{totalCount}</div>
            <div className="lbl">Billets vendus au total</div>
          </div>
          <div className="card stat">
            <div className="num">{formatPrice(totalRevenue)}</div>
            <div className="lbl">Revenus au total</div>
          </div>
          <div className="card stat">
            <div className="num">{directCount}</div>
            <div className="lbl">Ventes sans vendeur</div>
          </div>
        </div>
      )}

      {sellers.length === 0 && totalCount === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Aucune vente pour l&apos;instant. Ajoutez un vendeur ci-dessous pour lui donner un lien de vente
            personnel, ou partagez directement le lien public de l&apos;événement.
          </p>
        </div>
      )}

      {sellers.length === 0 && totalCount > 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Toutes les ventes proviennent du lien public de l&apos;événement — aucun vendeur n&apos;a encore été
            ajouté.
          </p>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Classement des vendeurs</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Vendeur</th>
                <th>Billets</th>
                <th>Revenus</th>
                <th>Quota utilisé</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.seller.id}>
                  <td>{i + 1}</td>
                  <td>{r.seller.name}</td>
                  <td>{r.count}</td>
                  <td>{formatPrice(r.revenue)}</td>
                  <td>
                    {r.quotaTotal > 0 ? (
                      <>
                        {r.quotaSold}/{r.quotaTotal}{" "}
                        <span className="muted">({Math.round((r.quotaSold / r.quotaTotal) * 100)}%)</span>
                      </>
                    ) : (
                      <span className="muted">Aucun quota</span>
                    )}
                  </td>
                </tr>
              ))}
              {directCount > 0 && (
                <tr>
                  <td>—</td>
                  <td className="muted">Ventes directes (sans vendeur)</td>
                  <td>{directCount}</td>
                  <td>{formatPrice(revenueOf(directSales))}</td>
                  <td className="muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {ranked.map(({ seller: s, myQuotas, count, revenue }) => (
        <SellerCard
          key={s.id}
          eventId={ev.id}
          seller={s}
          myQuotas={myQuotas}
          categories={categories}
          count={count}
          revenue={revenue}
          act={act}
        />
      ))}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ajouter un vendeur</h3>
        <div className="grid2">
          <div>
            <label>Nom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>Email (optionnel)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <label>Quotas par catégorie</label>
        {categories.map((c) => (
          <div key={c.id} className="grid2" style={{ alignItems: "center", marginBottom: 6 }}>
            <span>{c.name} (max dispo : {c.quantity})</span>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={q[c.id] ?? ""}
              onChange={(e) => setQ({ ...q, [c.id]: e.target.value })}
            />
          </div>
        ))}
        <button
          className="btn-accent"
          onClick={() => {
            const quotasBody = Object.entries(q)
              .filter(([, v]) => Number(v) > 0)
              .map(([category_id, v]) => ({ category_id, quota: Number(v) }));
            act(
              () => api(`/api/events/${ev.id}/sellers`, { method: "POST", body: { name, email: email || null, quotas: quotasBody } }),
              "Vendeur créé",
            );
            setName("");
            setEmail("");
            setQ({});
          }}
        >
          Créer le vendeur
        </button>
      </div>
    </>
  );
}

function SellerCard({
  eventId, seller, myQuotas, categories, count, revenue, act,
}: {
  eventId: string;
  seller: Record<string, any>;
  myQuotas: Array<Record<string, any>>;
  categories: Array<Record<string, any>>;
  count: number;
  revenue: number;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(seller.name);
  const [email, setEmail] = useState(seller.email ?? "");
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [quotaValue, setQuotaValue] = useState("");
  const [addingCategoryId, setAddingCategoryId] = useState("");
  const [addingQuota, setAddingQuota] = useState("");

  const assignedCategoryIds = new Set(myQuotas.map((mq) => mq.category_id));
  const availableCategories = categories.filter((c) => !assignedCategoryIds.has(c.id));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        {editing ? (
          <div className="grid2" style={{ flex: 1, marginRight: 12 }}>
            <div>
              <label>Nom</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>Email (optionnel)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        ) : (
          <strong>{seller.name}</strong>
        )}
        <span className="muted">
          {count} billet{count === 1 ? "" : "s"} · {formatPrice(revenue)}
        </span>
      </div>

      {editing ? (
        <div style={{ margin: "10px 0" }}>
          <button
            className="btn-sm btn-accent"
            onClick={() => {
              act(
                () =>
                  api(`/api/events/${eventId}/sellers/${seller.id}`, {
                    method: "PATCH",
                    body: { name, email: email || null },
                  }),
                "Vendeur modifié",
              );
              setEditing(false);
            }}
          >
            Enregistrer
          </button>{" "}
          <button className="btn-sm btn-ghost" onClick={() => setEditing(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <div style={{ margin: "10px 0" }}>
          <button className="btn-sm btn-ghost" onClick={() => setEditing(true)}>
            ✏️ Modifier
          </button>{" "}
          <button
            className="btn-sm btn-ghost"
            onClick={() => {
              if (confirm(`Supprimer le vendeur ${seller.name} ? Cette action est irréversible.`)) {
                act(() => api(`/api/events/${eventId}/sellers/${seller.id}`, { method: "DELETE" }), "Vendeur supprimé");
              }
            }}
          >
            🗑️ Supprimer
          </button>
        </div>
      )}

      {myQuotas.length === 0 && <p className="muted" style={{ fontSize: 14, margin: "4px 0" }}>Aucun quota attribué.</p>}
      {myQuotas.map((mq) => {
        const cat = categories.find((c) => c.id === mq.category_id);
        const pct = mq.quota > 0 ? Math.min(100, Math.round((mq.sold / mq.quota) * 100)) : 0;
        const isEditingThis = editingQuotaId === mq.id;
        return (
          <div key={mq.id} style={{ margin: "8px 0" }}>
            <div className="muted" style={{ fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>
                {cat?.name ?? "Catégorie supprimée"} : {mq.sold}/{isEditingThis ? "…" : mq.quota} vendus
              </span>
              {isEditingThis ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="number"
                    min={mq.sold}
                    value={quotaValue}
                    onChange={(e) => setQuotaValue(e.target.value)}
                    style={{ width: 70 }}
                  />
                  <button
                    className="btn-sm btn-accent"
                    onClick={() => {
                      act(
                        () =>
                          api(`/api/events/${eventId}/sellers/${seller.id}/quotas`, {
                            method: "POST",
                            body: { category_id: mq.category_id, quota: Number(quotaValue) },
                          }),
                        "Quota modifié",
                      );
                      setEditingQuotaId(null);
                    }}
                  >
                    OK
                  </button>
                  <button className="btn-sm btn-ghost" onClick={() => setEditingQuotaId(null)}>
                    ✕
                  </button>
                </span>
              ) : (
                <span style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn-sm btn-ghost"
                    onClick={() => {
                      setEditingQuotaId(mq.id);
                      setQuotaValue(String(mq.quota));
                    }}
                  >
                    Modifier
                  </button>
                  {mq.sold === 0 && (
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => {
                        if (confirm(`Retirer la catégorie ${cat?.name ?? ""} de ce vendeur ?`)) {
                          act(
                            () => api(`/api/events/${eventId}/sellers/${seller.id}/quotas/${mq.id}`, { method: "DELETE" }),
                            "Quota retiré",
                          );
                        }
                      }}
                    >
                      Retirer
                    </button>
                  )}
                </span>
              )}
            </div>
            <div style={{ background: "var(--line)", borderRadius: 99, height: 6, marginTop: 4 }}>
              <div
                style={{
                  width: `${pct}%`,
                  background: pct >= 100 ? "var(--err)" : "var(--accent)",
                  height: 6,
                  borderRadius: 99,
                }}
              />
            </div>
          </div>
        );
      })}

      {availableCategories.length > 0 && (
        <div className="grid2" style={{ alignItems: "center", margin: "10px 0" }}>
          <select value={addingCategoryId} onChange={(e) => setAddingCategoryId(e.target.value)}>
            <option value="">+ Ajouter une catégorie…</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (max dispo : {c.quantity})
              </option>
            ))}
          </select>
          <span style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              min={1}
              placeholder="Quota"
              value={addingQuota}
              onChange={(e) => setAddingQuota(e.target.value)}
              style={{ width: 90 }}
            />
            <button
              className="btn-sm btn-accent"
              disabled={!addingCategoryId || !addingQuota}
              onClick={() => {
                act(
                  () =>
                    api(`/api/events/${eventId}/sellers/${seller.id}/quotas`, {
                      method: "POST",
                      body: { category_id: addingCategoryId, quota: Number(addingQuota) },
                    }),
                  "Catégorie ajoutée",
                );
                setAddingCategoryId("");
                setAddingQuota("");
              }}
            >
              Ajouter
            </button>
          </span>
        </div>
      )}

      <label>Lien de vente</label>
      <CopyField value={`${WEB}/s/${seller.code}`} />
    </div>
  );
}

function SponsorsTab({
  ev, tiers, sponsors, act,
}: {
  ev: Record<string, any>;
  tiers: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [tierForm, setTierForm] = useState({ name: "", price: "", quantity: "1", description: "", perks: "", rank: "0", showcase: "logo" });
  const [editingTier, setEditingTier] = useState<Record<string, string> | null>(null);
  const [invite, setInvite] = useState({ email: "", company: "", contact: "" });

  // L'évaluation d'un sponsor n'est possible qu'après l'événement.
  const eventEnd = (ev.ends_at as string | null) ?? (ev.starts_at as string | null);
  const eventPast = Boolean(eventEnd) && new Date(String(eventEnd)).getTime() < Date.now();

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    invited: { label: "Invité", cls: "mut" },
    pending: { label: "Engagé — à confirmer", cls: "warn" },
    confirmed: { label: "Confirmé", cls: "ok" },
    declined: { label: "Refusé", cls: "err" },
  };

  const tierPayload = (f: Record<string, string>) => ({
    name: f.name,
    description: f.description || null,
    price_cents: Math.round(Number(f.price || 0) * 100),
    quantity: Math.max(1, Number(f.quantity || 1)),
    perks: f.perks.split("\n").map((p) => p.trim()).filter(Boolean),
    rank: Math.max(0, Number(f.rank || 0)),
    showcase: f.showcase,
  });

  const SHOWCASE_LABEL: Record<string, string> = {
    logo: "Logo seul",
    standard: "Intermédiaire (logo + présentation + liens)",
    full: "Complète (photos, vidéo, contacts, réseaux)",
  };

  const showcaseSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(SHOWCASE_LABEL).map(([k, lbl]) => (
        <option key={k} value={k}>{lbl}</option>
      ))}
    </select>
  );

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Paliers de sponsoring</h3>
        <p className="muted">
          Définissez vos offres (ex. Sponsor officiel, Or, Argent) : montant, nombre de places et avantages offerts
          (logo sur scène, kakémono, billets VIP inclus, mention au micro…). Le rang 0 est le palier le plus
          prestigieux, affiché en premier et en plus grand sur la page publique.
        </p>
        {tiers.length === 0 && (
          <div className="alert info">
            Tant qu&apos;aucun palier n&apos;est créé, votre événement n&apos;apparaît pas dans les{" "}
            <a href="/opportunites" target="_blank" rel="noreferrer">événements à sponsoriser</a> et les
            entreprises ne peuvent pas vous faire de propositions. Créez votre premier palier ci-dessous.
          </div>
        )}
        {tiers.length > 0 && (() => {
          const minRank = Math.min(...tiers.map((t) => Number(t.rank)));
          return (
            <div className="tier-cards">
              {tiers.map((t) => {
                const engaged = sponsors.filter((s) => s.tier_id === t.id && ["pending", "confirmed"].includes(s.status)).length;
                if (editingTier && editingTier.id === t.id) {
                  return (
                    <div key={t.id} className="card tier-card tier-card-editing">
                      <label style={{ marginTop: 0 }}>Nom</label>
                      <input value={editingTier.name} onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })} />
                      <div className="grid2">
                        <div>
                          <label>Montant (CAD)</label>
                          <input type="number" min={0} step="0.01" value={editingTier.price} onChange={(e) => setEditingTier({ ...editingTier, price: e.target.value })} />
                        </div>
                        <div>
                          <label>Places</label>
                          <input type="number" min={1} value={editingTier.quantity} onChange={(e) => setEditingTier({ ...editingTier, quantity: e.target.value })} />
                        </div>
                      </div>
                      <label>Rang d&apos;affichage (0 = principal)</label>
                      <input type="number" min={0} value={editingTier.rank} onChange={(e) => setEditingTier({ ...editingTier, rank: e.target.value })} />
                      <label>Description courte</label>
                      <input value={editingTier.description} onChange={(e) => setEditingTier({ ...editingTier, description: e.target.value })} />
                      <label>Niveau de vitrine sur la page publique</label>
                      {showcaseSelect(editingTier.showcase, (v) => setEditingTier({ ...editingTier, showcase: v }))}
                      <label>Avantages offerts (un par ligne)</label>
                      <textarea rows={4} value={editingTier.perks} onChange={(e) => setEditingTier({ ...editingTier, perks: e.target.value })} />
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                          className="btn-sm btn-accent"
                          onClick={() => {
                            act(
                              () => api(`/api/events/${ev.id}/sponsor-tiers/${t.id}`, { method: "PATCH", body: tierPayload(editingTier) }),
                              "Palier modifié",
                            );
                            setEditingTier(null);
                          }}
                        >
                          Enregistrer
                        </button>
                        <button className="btn-sm btn-ghost" onClick={() => setEditingTier(null)}>Annuler</button>
                      </div>
                    </div>
                  );
                }
                const isPrimary = Number(t.rank) === minRank;
                const perks = parsePerks(t.perks);
                return (
                  <div key={t.id} className={`card tier-card${isPrimary ? " tier-card-primary" : ""}`}>
                    {isPrimary && <span className="badge warn tier-card-badge">Palier principal</span>}
                    <h4 className="tier-card-name">{t.name}</h4>
                    <div className="tier-card-price">{formatPrice(t.price_cents, t.currency)}</div>
                    <p className="muted" style={{ fontSize: 13, margin: "2px 0 12px" }}>
                      {engaged}/{t.quantity} place{t.quantity > 1 ? "s" : ""} engagée{engaged > 1 ? "s" : ""}
                    </p>
                    {perks.length > 0 && (
                      <ul className="tier-card-perks">
                        {perks.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                    <div className="tier-card-actions">
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() =>
                          setEditingTier({
                            id: t.id,
                            name: t.name,
                            price: String(t.price_cents / 100),
                            quantity: String(t.quantity),
                            rank: String(t.rank),
                            description: t.description ?? "",
                            perks: perks.join("\n"),
                            showcase: t.showcase ?? "logo",
                          })
                        }
                      >
                        Modifier
                      </button>
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Supprimer le palier « ${t.name} » ?`)) {
                            act(() => api(`/api/events/${ev.id}/sponsor-tiers/${t.id}`, { method: "DELETE" }), "Palier supprimé");
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <h4 style={{ marginBottom: 4 }}>Ajouter un palier</h4>
        <div className="grid2">
          <div>
            <label>Nom</label>
            <input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Sponsor officiel" />
          </div>
          <div>
            <label>Montant (CAD)</label>
            <input type="number" min={0} step="0.01" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
          </div>
        </div>
        <div className="grid2">
          <div>
            <label>Nombre de places</label>
            <input type="number" min={1} value={tierForm.quantity} onChange={(e) => setTierForm({ ...tierForm, quantity: e.target.value })} />
          </div>
          <div>
            <label>Rang d&apos;affichage (0 = principal)</label>
            <input type="number" min={0} value={tierForm.rank} onChange={(e) => setTierForm({ ...tierForm, rank: e.target.value })} />
          </div>
        </div>
        <label>Description courte (optionnel)</label>
        <input value={tierForm.description} onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })} placeholder="Visibilité maximale avant, pendant et après le gala" />
        <label>Niveau de vitrine sur la page publique</label>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Ce que le sponsor pourra afficher sur la page de l&apos;événement : un simple logo, une présentation avec
          liens, ou une vitrine complète avec photos et vidéo — un vrai argument de vente pour vos gros paliers.
        </p>
        {showcaseSelect(tierForm.showcase, (v) => setTierForm({ ...tierForm, showcase: v }))}
        <label>Avantages offerts (un par ligne)</label>
        <textarea
          rows={4}
          value={tierForm.perks}
          onChange={(e) => setTierForm({ ...tierForm, perks: e.target.value })}
          placeholder={"Logo en grand sur la scène et la page de l'événement\n4 billets VIP offerts\nMention au micro pendant la soirée"}
        />
        <button
          className="btn-accent"
          disabled={!tierForm.name}
          onClick={() => {
            act(() => api(`/api/events/${ev.id}/sponsor-tiers`, { method: "POST", body: tierPayload(tierForm) }), "Palier créé");
            setTierForm({ name: "", price: "", quantity: "1", description: "", perks: "", rank: "0", showcase: "logo" });
          }}
        >
          Créer le palier
        </button>
      </div>

      {tiers.length > 0 && (() => {
        return (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Aperçu marketplace</h3>
            <p className="muted">
              Voici comment votre événement apparaît pour les entreprises qui cherchent un sponsoring.
            </p>
            <div className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {ev.logo_media_id && (
                  <img
                    src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file`}
                    alt=""
                    style={{ width: 58, height: 58, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 5, flex: "none" }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19 }}>
                    {ev.title}
                  </h3>
                  <p className="muted directory-meta" style={{ fontSize: 13 }}>
                    <span><CalendarDays size={13} /> {formatDate(ev.starts_at)}</span>
                    {ev.venue && <span><MapPin size={13} /> {ev.venue}</span>}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {tiers.map((t) => {
                  const engaged = sponsors.filter((s) => s.tier_id === t.id && ["pending", "confirmed"].includes(s.status)).length;
                  const remaining = t.quantity - engaged;
                  return (
                    <span key={t.id} className={`badge ${remaining > 0 ? "warn" : "mut"}`}>
                      {t.name} · {formatPrice(t.price_cents, t.currency)}
                      {remaining > 0 ? ` · ${remaining} place${remaining > 1 ? "s" : ""}` : " · complet"}
                    </span>
                  );
                })}
              </div>
            </div>
            <a href="/opportunites" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              Voir la page publique des opportunités
            </a>
          </div>
        );
      })()}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Inviter un sponsor</h3>
        <p className="muted">
          L&apos;entreprise reçoit un lien privé où elle découvre vos paliers, choisit son offre, renseigne ses
          informations et téléverse son logo. Vous confirmez ensuite son sponsoring une fois le paiement reçu.
        </p>
        <DirectoryPicker eventId={ev.id} act={act} />
        <div className="grid2">
          <div>
            <label>Email du contact *</label>
            <input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="direction@entreprise.com" />
          </div>
          <div>
            <label>Entreprise (optionnel)</label>
            <input value={invite.company} onChange={(e) => setInvite({ ...invite, company: e.target.value })} />
          </div>
        </div>
        <label>Nom du contact (optionnel)</label>
        <input value={invite.contact} onChange={(e) => setInvite({ ...invite, contact: e.target.value })} />
        <button
          className="btn-accent"
          disabled={!invite.email}
          onClick={() => {
            act(
              () =>
                api(`/api/events/${ev.id}/sponsors`, {
                  method: "POST",
                  body: { contact_email: invite.email, company_name: invite.company || null, contact_name: invite.contact || null },
                }),
              "Invitation sponsor envoyée",
            );
            setInvite({ email: "", company: "", contact: "" });
          }}
        >
          Envoyer l&apos;invitation
        </button>
      </div>

      {sponsors.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Sponsors</h3>
          <table>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Palier</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => {
                const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.invited;
                return (
                  <React.Fragment key={s.id}>
                    <tr>
                      <td>
                        {s.company_name ?? <span className="muted">—</span>}
                        {Boolean(s.company_verified) && (
                          <span className="badge ok" style={{ marginLeft: 6, fontSize: 11 }} title="Entreprise vérifiée (domaine ou registre)">
                            ✓ Vérifiée
                          </span>
                        )}
                        <span className="muted" style={{ display: "block", fontSize: 12 }}>
                          {s.contact_name ? `${s.contact_name} · ` : ""}{s.contact_email}
                        </span>
                      </td>
                      <td>{s.tier_name ?? <span className="muted">à choisir</span>}</td>
                      <td>
                        {s.amount_cents != null ? formatPrice(s.amount_cents, "CAD") : "—"}
                        {s.proposal_status === "pending" && (
                          <span className="badge warn" style={{ display: "block", marginTop: 4, fontSize: 11 }}>
                            Propose {formatPrice(s.proposed_cents ?? 0, "CAD")}
                          </span>
                        )}
                        {s.proposal_status === "accepted" && (
                          <span className="muted" style={{ display: "block", fontSize: 11 }}>montant négocié</span>
                        )}
                      </td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        {s.status === "pending" && (
                          <>
                            <button
                              className="btn-sm btn-accent"
                              onClick={() =>
                                act(
                                  () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "confirmed" } }),
                                  "Sponsor confirmé",
                                )
                              }
                            >
                              Confirmer
                            </button>{" "}
                            <button
                              className="btn-sm btn-ghost"
                              onClick={() =>
                                act(
                                  () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "declined" } }),
                                  "Sponsor refusé",
                                )
                              }
                            >
                              Refuser
                            </button>
                          </>
                        )}
                        {s.status === "confirmed" && (
                          <button
                            className="btn-sm btn-ghost"
                            onClick={() =>
                              act(
                                () => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "PATCH", body: { status: "pending" } }),
                                "Repassé en attente",
                              )
                            }
                          >
                            Repasser en attente
                          </button>
                        )}{" "}
                        <button
                          className="btn-sm btn-ghost"
                          onClick={() => {
                            if (confirm("Supprimer ce sponsor et son lien d'invitation ?")) {
                              act(() => api(`/api/events/${ev.id}/sponsors/${s.id}`, { method: "DELETE" }), "Sponsor supprimé");
                            }
                          }}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                    {s.proposal_status === "pending" && (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 0 }}>
                          <div className="alert warn" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "4px 0" }}>
                            <span style={{ flex: 1, minWidth: 220 }}>
                              <strong>Contre-proposition :</strong>{" "}
                              {formatPrice(s.proposed_cents ?? 0, "CAD")} au lieu de{" "}
                              {s.amount_cents != null ? formatPrice(s.amount_cents, "CAD") : "—"}
                              {s.proposed_message && (
                                <span className="muted" style={{ display: "block", fontSize: 13, fontStyle: "italic" }}>
                                  « {s.proposed_message} »
                                </span>
                              )}
                            </span>
                            <span style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn-sm btn-accent"
                                onClick={() =>
                                  act(
                                    () => api(`/api/events/${ev.id}/sponsors/${s.id}/proposal`, { method: "POST", body: { action: "accept" } }),
                                    "Montant négocié accepté",
                                  )
                                }
                              >
                                Accepter
                              </button>
                              <button
                                className="btn-sm btn-ghost"
                                onClick={() =>
                                  act(
                                    () => api(`/api/events/${ev.id}/sponsors/${s.id}/proposal`, { method: "POST", body: { action: "reject" } }),
                                    "Contre-proposition refusée",
                                  )
                                }
                              >
                                Refuser
                              </button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {s.status === "confirmed" && eventPast && (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 0 }}>
                          <RateSponsorInline eventId={ev.id} sponsor={s} act={act} />
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} style={{ paddingTop: 0 }}>
                        <CopyField value={`${WEB}/sp/${s.token}`} />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Évaluation d'un sponsor confirmé après l'événement (note 1–5 + commentaire). */
function RateSponsorInline({
  eventId, sponsor, act,
}: {
  eventId: string;
  sponsor: Record<string, any>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = (rating: number, comment: string) => {
    setBusy(true);
    act(
      () =>
        api(`/api/events/${eventId}/sponsors/${sponsor.id}/review`, {
          method: "POST",
          body: { rating, comment: comment || null },
        }).finally(() => {
          setBusy(false);
          setOpen(false);
        }),
      "Évaluation enregistrée",
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "2px 0 6px" }}>
      {sponsor.my_rating != null && !open && <Stars value={Number(sponsor.my_rating)} />}
      {sponsor.company_rating != null && (
        <span className="muted" style={{ fontSize: 12 }}>
          L&apos;entreprise vous a noté {sponsor.company_rating}/5
        </span>
      )}
      {!open ? (
        <button className="btn-sm btn-ghost" onClick={() => setOpen(true)}>
          {sponsor.my_rating != null ? "Modifier ma note" : "⭐ Évaluer ce sponsor"}
        </button>
      ) : (
        <div style={{ flexBasis: "100%", maxWidth: 420 }}>
          <RatingForm
            initialRating={sponsor.my_rating}
            initialComment={sponsor.my_comment}
            busy={busy}
            onSubmit={submit}
            label="Enregistrer ma note"
          />
          <button className="btn-sm btn-ghost" disabled={busy} onClick={() => setOpen(false)} style={{ marginTop: 6 }}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Rapport organisateur : entièrement calculé à partir des données déjà chargées
 * par GET /api/events/:id — aucune nouvelle table ni tracking, juste de l'agrégation.
 */
function ReportTab({
  ev, categories, sales, refundRequests, waitlist, sponsorTiers, sponsors,
}: {
  ev: Record<string, any>;
  categories: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
  refundRequests: Array<Record<string, any>>;
  waitlist: Array<Record<string, any>>;
  sponsorTiers: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
}) {
  const currency = categories[0]?.currency ?? sponsorTiers[0]?.currency ?? "CAD";

  // Billetterie : revenu réel (billets valides/utilisés) — exclut déjà les remboursés.
  const ticketRevenue = sales.reduce((s, r) => s + (r.revenue_cents ?? 0), 0);
  const ticketsSold = categories.reduce((s, c) => s + c.sold, 0);
  const ticketsCapacity = categories.reduce((s, c) => s + c.quantity, 0);
  const fillRate = ticketsCapacity > 0 ? ticketsSold / ticketsCapacity : null;
  const refundsByStatus = { pending: 0, approved: 0, rejected: 0 };
  for (const r of refundRequests) refundsByStatus[r.status as keyof typeof refundsByStatus]++;

  // Sponsoring : réalisé vs potentiel si tous les paliers étaient vendus au complet.
  const confirmedSponsors = sponsors.filter((s) => s.status === "confirmed");
  const sponsorRevenue = confirmedSponsors.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const sponsorPotential = sponsorTiers.reduce((s, t) => s + t.price_cents * t.quantity, 0);
  const sponsorRealization = sponsorPotential > 0 ? sponsorRevenue / sponsorPotential : null;
  const pipeline = { invited: 0, pending: 0, confirmed: 0, declined: 0 };
  for (const s of sponsors) if (s.status in pipeline) pipeline[s.status as keyof typeof pipeline]++;
  const decided = pipeline.confirmed + pipeline.declined;
  const acceptanceRate = decided > 0 ? pipeline.confirmed / decided : null;
  const revenueByTier = new Map<string, number>();
  for (const s of confirmedSponsors) {
    const name = s.tier_name ?? "Sans palier";
    revenueByTier.set(name, (revenueByTier.get(name) ?? 0) + (s.amount_cents ?? 0));
  }

  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <Link href="/dashboard/analytics" className="btn btn-ghost btn-sm">
          Voir les analyses globales →
        </Link>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Billetterie</h3>
        {categories.length === 0 ? (
          <p className="muted">Aucune catégorie de billet pour cet événement.</p>
        ) : (
          <>
            <div className="report-stats">
              <div className="report-stat">
                <span className="report-stat-value">{formatPrice(ticketRevenue, currency)}</span>
                <span className="report-stat-label">Revenu billetterie</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{ticketsSold}/{ticketsCapacity}</span>
                <span className="report-stat-label">Billets vendus ({pct(fillRate)} rempli)</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{waitlist.length}</span>
                <span className="report-stat-label">En liste d&apos;attente</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{refundsByStatus.approved}</span>
                <span className="report-stat-label">
                  Remboursés{refundsByStatus.pending > 0 ? ` (${refundsByStatus.pending} en attente)` : ""}
                </span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Vendus</th>
                  <th>Remplissage</th>
                  <th>Prix</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.sold}/{c.quantity}</td>
                    <td>{pct(c.quantity > 0 ? c.sold / c.quantity : null)}</td>
                    <td>{formatPrice(c.price_cents, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sponsoring</h3>
        {sponsorTiers.length === 0 ? (
          <p className="muted">Aucun palier de sponsoring pour cet événement.</p>
        ) : (
          <>
            <div className="report-stats">
              <div className="report-stat">
                <span className="report-stat-value">{formatPrice(sponsorRevenue, currency)}</span>
                <span className="report-stat-label">
                  Confirmé{sponsorPotential > 0 ? ` sur ${formatPrice(sponsorPotential, currency)} possibles (${pct(sponsorRealization)})` : ""}
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{pct(acceptanceRate)}</span>
                <span className="report-stat-label">
                  Taux d&apos;acceptation ({pipeline.confirmed} confirmé{pipeline.confirmed > 1 ? "s" : ""},{" "}
                  {pipeline.declined} refusé{pipeline.declined > 1 ? "s" : ""})
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{pipeline.invited + pipeline.pending}</span>
                <span className="report-stat-label">En cours (invité/engagé)</span>
              </div>
            </div>
            {revenueByTier.size > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Palier</th>
                    <th>Revenu confirmé</th>
                  </tr>
                </thead>
                <tbody>
                  {[...revenueByTier.entries()].map(([name, cents]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{formatPrice(cents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Une photo (slot 1 ou 2) d'un artiste : upload, remplacement, suppression. */
function PerformerPhoto({
  eventId, performerId, slot, mediaId, act,
}: {
  eventId: string;
  performerId: string;
  slot: 1 | 2;
  mediaId: string | null;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await act(() => api(`/api/events/${eventId}/performers/${performerId}/photo?slot=${slot}`, { method: "POST", body: fd }));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {mediaId ? (
        <img
          src={`${API_BASE}/api/public/media/${mediaId}/file`}
          alt=""
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
        />
      ) : (
        <div className="sponsor-name-fallback" style={{ width: 48, height: 48, fontSize: 14 }}>
          {slot}
        </div>
      )}
      <button type="button" className="btn-sm btn-ghost" disabled={uploading} onClick={() => fileInput.current?.click()}>
        {uploading ? "Envoi…" : mediaId ? "Changer" : `Photo ${slot}`}
      </button>
      {mediaId && (
        <button
          type="button"
          className="btn-sm btn-ghost"
          onClick={() =>
            act(
              () => api(`/api/events/${eventId}/performers/${performerId}/photo?slot=${slot}`, { method: "DELETE" }),
              "Photo supprimée",
            )
          }
        >
          Retirer
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}

/** Artistes et intervenants (musiciens, animateur/MC, imprésario…) présentés sur la page publique. */
function PerformersTab({
  ev, performers, act,
}: {
  ev: Record<string, any>;
  performers: Array<Record<string, any>>;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [form, setForm] = useState({ name: "", role: "", bio: "", rank: "0" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", bio: "", rank: "0" });

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Artistes & intervenants</h3>
      <p className="muted">
        Musiciens, animateur/MC, imprésario, conférencier… Ajoutez qui sera présent à votre événement : nom, rôle
        libre, et jusqu&apos;à deux photos optionnelles. Ils apparaissent sur la page publique de l&apos;événement.
      </p>

      {performers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Photos</th>
              <th>Rang</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {performers.map((p) =>
              editingId === p.id ? (
                <React.Fragment key={p.id}>
                  <tr>
                    <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                    <td>
                      <input
                        list="performer-roles"
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      />
                    </td>
                    <td className="muted">—</td>
                    <td><input type="number" min={0} style={{ width: 60 }} value={editForm.rank} onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })} /></td>
                    <td>
                      <button
                        className="btn-sm btn-accent"
                        onClick={() => {
                          act(
                            () =>
                              api(`/api/events/${ev.id}/performers/${p.id}`, {
                                method: "PATCH",
                                body: {
                                  name: editForm.name,
                                  role: editForm.role || null,
                                  bio: editForm.bio || null,
                                  rank: Math.max(0, Number(editForm.rank || 0)),
                                },
                              }),
                            "Artiste modifié",
                          );
                          setEditingId(null);
                        }}
                      >
                        Enregistrer
                      </button>{" "}
                      <button className="btn-sm btn-ghost" onClick={() => setEditingId(null)}>Annuler</button>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5}>
                      <label style={{ marginTop: 0 }}>Courte présentation (optionnel)</label>
                      <textarea rows={2} value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} />
                    </td>
                  </tr>
                </React.Fragment>
              ) : (
                <React.Fragment key={p.id}>
                  <tr>
                    <td>
                      {p.name}
                      {p.bio && <span className="muted" style={{ display: "block", fontSize: 12 }}>{p.bio}</span>}
                    </td>
                    <td>{p.role ?? <span className="muted">—</span>}</td>
                    <td>{[p.photo1_media_id, p.photo2_media_id].filter(Boolean).length}/2</td>
                    <td>{p.rank}</td>
                    <td>
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditForm({ name: p.name, role: p.role ?? "", bio: p.bio ?? "", rank: String(p.rank) });
                        }}
                      >
                        Modifier
                      </button>{" "}
                      <button
                        className="btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Retirer ${p.name} de l'événement ?`)) {
                            act(() => api(`/api/events/${ev.id}/performers/${p.id}`, { method: "DELETE" }), "Artiste retiré");
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} style={{ paddingTop: 0, display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <PerformerPhoto eventId={ev.id} performerId={p.id} slot={1} mediaId={p.photo1_media_id} act={act} />
                      <PerformerPhoto eventId={ev.id} performerId={p.id} slot={2} mediaId={p.photo2_media_id} act={act} />
                    </td>
                  </tr>
                </React.Fragment>
              ),
            )}
          </tbody>
        </table>
      )}

      <datalist id="performer-roles">
        {PERFORMER_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <h4 style={{ marginBottom: 4 }}>Ajouter un artiste ou intervenant</h4>
      <div className="grid2">
        <div>
          <label>Nom *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DJ Max, Marie Tremblay…" />
        </div>
        <div>
          <label>Rôle</label>
          <input
            list="performer-roles"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="Musicien / DJ, Animateur / MC…"
          />
        </div>
      </div>
      <label>Courte présentation (optionnel)</label>
      <textarea rows={2} maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      <label>Rang d&apos;affichage (0 = en premier)</label>
      <input type="number" min={0} style={{ width: 100 }} value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
      <div>
        <button
          className="btn-accent"
          disabled={!form.name}
          onClick={() => {
            act(
              () =>
                api(`/api/events/${ev.id}/performers`, {
                  method: "POST",
                  body: { name: form.name, role: form.role || null, bio: form.bio || null, rank: Math.max(0, Number(form.rank || 0)) },
                }),
              "Artiste ajouté — vous pourrez ajouter ses photos ensuite",
            );
            setForm({ name: "", role: "", bio: "", rank: "0" });
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

const WEBHOOK_TYPE_LABELS: Record<string, string> = {
  "ticket.sold": "Billet vendu",
  "sponsor.confirmed": "Sponsoring confirmé",
  "sponsor.declined": "Sponsoring refusé",
  "refund.requested": "Demande de remboursement",
};

/**
 * Webhooks sortants génériques : brancher Zapier/Make ou un outil maison sur les
 * événements clés (billet vendu, sponsoring confirmé/refusé, remboursement
 * demandé) sans intégration nommée à maintenir. Charge ses propres données —
 * cet onglet n'a pas besoin du payload principal de l'événement.
 */
function WebhooksTab({ eventId }: { eventId: string }) {
  const [webhooks, setWebhooks] = useState<Array<Record<string, any>> | null>(null);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ webhooks: Array<Record<string, any>>; available_types: string[] }>(`/api/events/${eventId}/webhooks`)
      .then((r) => {
        setWebhooks(r.webhooks);
        setAvailableTypes(r.available_types);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [eventId]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; secret: string }>(`/api/events/${eventId}/webhooks`, {
        method: "POST",
        body: { url, event_types: types.length ? types : undefined },
      });
      setNewSecret(res.secret);
      setUrl("");
      setTypes([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!webhooks) return <div className="card"><p className="muted">Chargement…</p></div>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Webhooks sortants</h3>
      <p className="muted">
        Recevez une notification HTTP sur les événements clés de votre événement — utile pour brancher Zapier,
        Make, ou votre propre outil (CRM, feuille de calcul, script maison…). Chaque envoi est signé (en-tête{" "}
        <code>X-EventGalo-Signature</code>) pour vérifier qu&apos;il vient bien d&apos;EventGalo.
      </p>

      {error && <div className="alert err">{error}</div>}
      {newSecret && (
        <div className="alert warn">
          <strong>Secret du webhook (affiché une seule fois) :</strong>
          <CopyField value={newSecret} />
          Conservez-le pour vérifier la signature des envois — on ne pourra plus vous le remontrer.
        </div>
      )}

      {webhooks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Événements</th>
              <th>Dernière livraison</th>
              <th>Actif</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => {
              const subscribed: string[] = w.event_types ? JSON.parse(w.event_types) : [];
              return (
                <tr key={w.id}>
                  <td style={{ maxWidth: 260, overflowWrap: "break-word" }}>{w.url}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {subscribed.length ? subscribed.map((t) => WEBHOOK_TYPE_LABELS[t] ?? t).join(", ") : "Tous"}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {w.last_triggered_at ? (
                      <>
                        {formatDate(w.last_triggered_at)}{" "}
                        <span className={`badge ${w.last_status >= 200 && w.last_status < 300 ? "ok" : "err"}`}>
                          {w.last_status === 0 ? "Échec réseau" : w.last_status}
                        </span>
                      </>
                    ) : (
                      <span className="muted">Jamais déclenché</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(w.enabled)}
                      onChange={(e) => {
                        api(`/api/events/${eventId}/webhooks/${w.id}`, { method: "PATCH", body: { enabled: e.target.checked } })
                          .then(load)
                          .catch((err) => setError(err instanceof Error ? err.message : "Erreur"));
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => {
                        if (confirm("Supprimer ce webhook ?")) {
                          api(`/api/events/${eventId}/webhooks/${w.id}`, { method: "DELETE" })
                            .then(load)
                            .catch((err) => setError(err instanceof Error ? err.message : "Erreur"));
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h4 style={{ marginBottom: 4 }}>Ajouter un webhook</h4>
      <label>URL (https:// uniquement) *</label>
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" />
      <label>Événements à recevoir (aucune case = tous)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "6px 0 14px" }}>
        {availableTypes.map((t) => (
          <label key={t} className="check" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={types.includes(t)}
              onChange={(e) =>
                setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))
              }
            />
            <span style={{ fontWeight: 400 }}>{WEBHOOK_TYPE_LABELS[t] ?? t}</span>
          </label>
        ))}
      </div>
      <button className="btn-accent" disabled={busy || !url} onClick={create}>
        {busy ? "Ajout…" : "Ajouter le webhook"}
      </button>
    </div>
  );
}

/** Recherche dans l'annuaire public et envoi de demandes de sponsoring en un clic. */
function DirectoryPicker({
  eventId, act,
}: {
  eventId: string;
  act: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<Array<Record<string, any>> | null>(null);
  const [searching, setSearching] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function generateMessage(companyName?: string) {
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>(`/api/events/${eventId}/ai/draft`, {
        method: "POST",
        body: { target: "sponsor_pitch", hint: message, companyName },
      });
      setMessage(res.text);
    } catch {
      // Échec silencieux : le champ reste tel quel, l'organisateur peut réessayer.
    } finally {
      setAiBusy(false);
    }
  }

  async function search() {
    setSearching(true);
    try {
      const r = await api<{ companies: Array<Record<string, any>> }>(
        `/api/public/companies?q=${encodeURIComponent(q)}`,
        { auth: false },
      );
      setResults(r.companies);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  if (!open) {
    return (
      <p style={{ margin: "0 0 14px" }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setOpen(true);
            search();
          }}
        >
          🔎 Inviter depuis l&apos;annuaire des sponsors
        </button>
      </p>
    );
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="copy-row">
        <input
          placeholder="Rechercher une entreprise…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn-sm btn-accent" disabled={searching} onClick={search}>
          {searching ? "…" : "Chercher"}
        </button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
      {results !== null && results.length === 0 && (
        <p className="muted" style={{ margin: "10px 0 0" }}>
          Aucune entreprise trouvée dans l&apos;annuaire.{" "}
          <a href="/sponsors" target="_blank" rel="noreferrer">Voir l&apos;annuaire</a>
        </p>
      )}
      {results !== null && results.length > 0 && (
        <>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <label style={{ margin: 0 }}>Un mot pour l&apos;entreprise (optionnel, commun aux demandes)</label>
            <button type="button" className="btn-ghost btn-sm" disabled={aiBusy} onClick={() => generateMessage()}>
              {aiBusy ? "Rédaction…" : "✨ Générer avec l'IA"}
            </button>
          </div>
          <textarea
            rows={2}
            maxLength={800}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Pourquoi ce partenariat a du sens…"
          />
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.slice(0, 8).map((co) => (
              <div
                key={co.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong>{co.name}</strong>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {[co.sector, co.city].filter(Boolean).join(" · ") || "—"}
                    {co.sponsorships > 0 ? ` · ${co.sponsorships} sponsoring${co.sponsorships > 1 ? "s" : ""}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-sm btn-accent"
                  onClick={() =>
                    act(
                      () =>
                        api(`/api/events/${eventId}/sponsors/from-directory`, {
                          method: "POST",
                          body: { company_id: co.id, message: message.trim() || null },
                        }),
                      `Demande envoyée à ${co.name}`,
                    )
                  }
                >
                  Proposer
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
