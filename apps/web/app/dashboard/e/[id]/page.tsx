"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE, api, formatDate, formatPrice, getToken } from "@/lib/api";
import { MediaGallery, type MediaItem } from "@/components/media-gallery";
import { TicketPreview } from "@/components/ticket-preview";

interface Detail {
  event: Record<string, any>;
  guests: Array<Record<string, any>>;
  categories: Array<Record<string, any>>;
  sellers: Array<Record<string, any>>;
  seller_quotas: Array<Record<string, any>>;
  announcements: Array<Record<string, any>>;
  refund_requests: Array<Record<string, any>>;
  sales: Array<Record<string, any>>;
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

  const { event: ev, guests, categories, sellers, seller_quotas, announcements, refund_requests, sales } = data;
  const opened = guests.filter((g) => g.opened_at).length;
  const yes = guests.filter((g) => g.rsvp_status === "yes").length;
  const no = guests.filter((g) => g.rsvp_status === "no").length;
  const soldTotal = categories.reduce((s, c) => s + c.sold, 0);
  const revenue = sales.reduce((s, r) => s + (r.revenue_cents ?? 0), 0);

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>{ev.title}</h1>
        <Link href={`/dashboard/e/${ev.id}/edit`} className="btn btn-ghost btn-sm">
          ✏️ Modifier
        </Link>
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
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Détails</h3>
            <p className="muted">
              {ev.description || "Pas de description."}
              {ev.dress_code ? ` · Dress code : ${ev.dress_code}` : ""}
            </p>
            <a className="btn btn-ghost btn-sm" href={`${API_BASE}/api/events/${ev.id}/export`} onClick={(e) => {
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
            }}>
              ⬇ Exporter les données (JSON)
            </a>
          </div>
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

      {tab === "photos" && <MediaTab eventId={ev.id} act={act} />}

      {tab === "billets" && <CategoriesTab ev={ev} categories={categories} act={act} />}

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

function MediaTab({ eventId, act }: { eventId: string; act: (fn: () => Promise<unknown>, ok?: string) => void }) {
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
          />
        )}
      </div>
    </>
  );
}

function AnnounceForm({ eventId, act }: { eventId: string; act: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const [body, setBody] = useState("");
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Nouvelle annonce</h3>
      <p className="muted">Visible sur toutes les invitations, et envoyée par email aux invités.</p>
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

function CategoriesTab({ ev, categories, act }: { ev: Record<string, any>; categories: Array<Record<string, any>>; act: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const [form, setForm] = useState({ name: "", price: "", quantity: "" });
  const [editing, setEditing] = useState<{ id: string; name: string; price: string; quantity: string } | null>(null);
  const [preview, setPreview] = useState<{ name: string; priceCents: number } | null>(null);
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) =>
              editing && editing.id === c.id ? (
                <tr key={c.id}>
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
              ) : (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{formatPrice(c.price_cents, c.currency)}</td>
                  <td>
                    {c.sold}/{c.quantity}
                  </td>
                  <td>{c.quantity - c.sold}</td>
                  <td>
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => setPreview({ name: c.name, priceCents: c.price_cents })}
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
                  },
                }),
              "Catégorie créée",
            );
            setForm({ name: "", price: "", quantity: "" });
          }}
        >
          Créer
        </button>{" "}
        <button
          type="button"
          className="btn-ghost"
          disabled={!form.name}
          onClick={() => setPreview({ name: form.name, priceCents: Math.round(Number(form.price || 0) * 100) })}
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
