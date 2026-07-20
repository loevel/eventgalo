"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, formatPrice } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity: number;
}

function parseGuestLines(
  text: string,
): Array<{ name: string; email: string | null; table_name: string | null; guardian_name: string | null }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, email, table_name, guardian_name] = l.split(",").map((s) => s.trim());
      return { name, email: email || null, table_name: table_name || null, guardian_name: guardian_name || null };
    })
    .filter((g) => g.name);
}

const KIDS_RSVP_QUESTION = "Allergies alimentaires ou informations utiles ? (optionnel)";

const STEP_LABELS = ["Essentiels", "Configuration", "Récapitulatif"] as const;

type TemplateKey = "generic" | "wedding" | "birthday_adult" | "birthday_kids" | "gala" | "conference";

interface EventTemplate {
  label: string;
  dressCode?: string;
  description?: string;
}

const TEMPLATES: Record<TemplateKey, EventTemplate> = {
  generic: { label: "Générique / autre" },
  wedding: {
    label: "💍 Mariage",
    dressCode: "Tenue de soirée / élégante",
    description:
      "18 h 00 – Cérémonie\n19 h 00 – Cocktail de bienvenue\n20 h 00 – Repas\n21 h 30 – Ouverture de bal\n22 h 00 – Soirée dansante",
  },
  birthday_adult: {
    label: "🎂 Anniversaire",
    dressCode: "Décontracté chic",
    description: "19 h 00 – Accueil des invités\n19 h 30 – Apéritif\n20 h 30 – Repas\n21 h 30 – Gâteau et discours\n22 h 00 – Musique et danse",
  },
  birthday_kids: { label: "🎈 Anniversaire d'enfant" },
  gala: {
    label: "🏆 Gala",
    dressCode: "Tenue de gala / cravate noire",
    description:
      "18 h 00 – Accueil et cocktail\n19 h 00 – Mot d'ouverture\n19 h 30 – Souper\n20 h 30 – Remise de prix / animation\n21 h 30 – Soirée dansante",
  },
  conference: {
    label: "🎤 Conférence",
    dressCode: "Tenue professionnelle",
    description:
      "08 h 30 – Accueil et inscription\n09 h 00 – Mot de bienvenue\n09 h 15 – Conférences\n12 h 00 – Pause déjeuner\n13 h 30 – Ateliers\n16 h 30 – Clôture",
  },
};

const PRIVATE_TEMPLATES: TemplateKey[] = ["generic", "wedding", "birthday_adult", "birthday_kids"];
const TICKETED_TEMPLATES: TemplateKey[] = ["generic", "gala", "conference"];

const TEMPLATE_TICKET_SUGGESTIONS: Partial<Record<TemplateKey, Array<{ name: string; percent: number; perks?: string[] }>>> = {
  gala: [
    { name: "Standard", percent: 0.6 },
    { name: "VIP", percent: 0.3, perks: ["Placement prioritaire", "Coupe de bienvenue"] },
    { name: "VIP+", percent: 0.1, perks: ["Table réservée", "Bouteille incluse", "Accès salon privé"] },
  ],
  conference: [
    { name: "Standard", percent: 0.8 },
    { name: "Premium", percent: 0.2, perks: ["Accès ateliers", "Repas inclus", "Kit de bienvenue"] },
  ],
};

export default function NewEvent() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [eventId, setEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape 1 — essentiels
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"private" | "ticketed">("private");
  const [template, setTemplate] = useState<TemplateKey>("generic");
  const occasion = template === "birthday_kids" ? "kids" : "generic";
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("100");

  // Étape 2 — billetterie
  const [categories, setCategories] = useState<Category[]>([]);
  const [catForm, setCatForm] = useState({ name: "", price: "", quantity: "", perks: "" });

  // Étape 2 — invités (saisis localement, envoyés seulement à la fin)
  const [guestBulk, setGuestBulk] = useState("");
  const guestList = parseGuestLines(guestBulk);

  // Étape 3 — récapitulatif
  const [description, setDescription] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [seatingPlan, setSeatingPlan] = useState("");
  const [rsvpQuestion, setRsvpQuestion] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDone, setLogoDone] = useState(false);

  async function uploadLogo(file: File) {
    if (!eventId) return;
    setLogoUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ media: { id: string } }>(`/api/events/${eventId}/media`, { method: "POST", body: fd });
      await api(`/api/events/${eventId}/logo`, { method: "PATCH", body: { media_id: res.media.id } });
      setLogoDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLogoUploading(false);
    }
  }
  const [refundKind, setRefundKind] = useState("full");
  const [refundDays, setRefundDays] = useState("7");
  const [refundPercent, setRefundPercent] = useState("50");
  const [aiBusy, setAiBusy] = useState(false);

  async function generateDescription() {
    if (!eventId) return;
    setAiBusy(true);
    setError(null);
    try {
      const res = await api<{ text: string }>(`/api/events/${eventId}/ai/draft`, {
        method: "POST",
        body: { target: "description" },
      });
      setDescription(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAiBusy(false);
    }
  }

  const allocated = categories.reduce((s, c) => s + c.quantity, 0);

  const loadCategories = useCallback(async (id: string) => {
    const r = await api<{ categories: Category[] }>(`/api/events/${id}`);
    setCategories(r.categories);
  }, []);

  useEffect(() => {
    if (eventId && type === "ticketed" && step === 2) loadCategories(eventId);
  }, [eventId, type, step, loadCategories]);

  useEffect(() => {
    if (occasion === "kids" && !rsvpQuestion) setRsvpQuestion(KIDS_RSVP_QUESTION);
  }, [occasion, rsvpQuestion]);

  // En changeant de type, on retombe sur "générique" si le modèle choisi ne s'applique plus.
  useEffect(() => {
    const allowed = type === "private" ? PRIVATE_TEMPLATES : TICKETED_TEMPLATES;
    if (!allowed.includes(template)) setTemplate("generic");
  }, [type, template]);

  function applyTemplate(key: TemplateKey) {
    setTemplate(key);
    const t = TEMPLATES[key];
    setDressCode(t.dressCode ?? "");
    setDescription(t.description ?? "");
  }

  async function continueFromStep1(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
        throw new Error("La date de fin doit être après la date de début.");
      }
      const payload = {
        title,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        venue: venue || null,
        address: address || null,
        capacity: Number(capacity),
      };
      if (!eventId) {
        const res = await api<{ event: { id: string } }>("/api/events", {
          method: "POST",
          body: { ...payload, type, status: "draft" },
        });
        setEventId(res.event.id);
      } else {
        await api(`/api/events/${eventId}`, { method: "PATCH", body: payload });
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!eventId || !catForm.name || !catForm.quantity) return;
    setError(null);
    try {
      await api(`/api/events/${eventId}/categories`, {
        method: "POST",
        body: {
          name: catForm.name,
          price_cents: Math.round(Number(catForm.price || 0) * 100),
          quantity: Number(catForm.quantity),
          perks: catForm.perks.split("\n").map((p) => p.trim()).filter(Boolean),
        },
      });
      setCatForm({ name: "", price: "", quantity: "", perks: "" });
      loadCategories(eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  function continueFromStep2() {
    if (type === "ticketed" && categories.length === 0) {
      if (!confirm("Continuer sans aucune catégorie de billet ? Personne ne pourra encore acheter de billet — vous pourrez en ajouter plus tard.")) {
        return;
      }
    }
    setStep(3);
  }

  async function finish(publish: boolean) {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    try {
      if (type === "private" && guestList.length > 0) {
        await api(`/api/events/${eventId}/guests`, { method: "POST", body: { guests: guestList } });
      }
      await api(`/api/events/${eventId}`, {
        method: "PATCH",
        body: {
          description: description || null,
          dress_code: dressCode || null,
          seating_plan: seatingPlan || null,
          rsvp_question: type === "private" ? rsvpQuestion || null : null,
          status: publish ? "published" : "draft",
          refund_policy:
            type === "ticketed"
              ? {
                  kind: refundKind,
                  days_before: Number(refundDays),
                  percent: refundKind === "partial" ? Number(refundPercent) : 100,
                }
              : null,
        },
      });
      router.replace(`/dashboard/e/${eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <main className="container narrow">
      <h1>Créer un événement</h1>

      <div className="grid3" style={{ marginBottom: 20 }}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className="step" style={{ opacity: step === n ? 1 : 0.5, padding: "8px 6px" }}>
              <div className="step-num" style={{ background: step >= n ? "var(--accent)" : "var(--ink)" }}>
                {step > n ? "✓" : n}
              </div>
              <h3 style={{ fontSize: 14 }}>{label}</h3>
            </div>
          );
        })}
      </div>

      {error && <div className="alert err">{error}</div>}

      {step === 1 && (
        <form onSubmit={continueFromStep1} className="card">
          <label>Titre *</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gala annuel 2026" />

          <label>Type d&apos;événement</label>
          {eventId ? (
            <p className="muted">
              {type === "ticketed" ? "Avec billetterie" : "Privé (invitations & RSVP)"} — non modifiable après création
            </p>
          ) : (
            <select value={type} onChange={(e) => setType(e.target.value as "private" | "ticketed")}>
              <option value="private">Privé (invitations &amp; RSVP)</option>
              <option value="ticketed">Avec billetterie (catégories, vendeurs, paiements)</option>
            </select>
          )}

          <label>Modèle (pré-remplit dress code et programme — modifiable ensuite)</label>
          <select value={template} onChange={(e) => applyTemplate(e.target.value as TemplateKey)}>
            {(type === "private" ? PRIVATE_TEMPLATES : TICKETED_TEMPLATES).map((k) => (
              <option key={k} value={k}>{TEMPLATES[k].label}</option>
            ))}
          </select>
          {template === "birthday_kids" && (
            <p className="muted" style={{ fontSize: 13 }}>
              On adapte la saisie des invités pour indiquer facilement le parent à contacter, et on ajoute une
              question RSVP pour les allergies et infos utiles.
            </p>
          )}

          <div className="grid2">
            <div>
              <label>Début (date et heure) *</label>
              <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <label>Fin (optionnel)</label>
              <input type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="grid2">
            <div>
              <label>Lieu</label>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Salle Le Prestige" />
            </div>
            <div>
              <label>Adresse</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 rue…, Montréal" />
            </div>
          </div>

          <label>Capacité totale de la salle *</label>
          <input required type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />

          <button type="submit" className="btn-accent" disabled={busy}>
            {busy ? "Enregistrement…" : "Continuer"}
          </button>
        </form>
      )}

      {step === 2 && type === "ticketed" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              Catégories de billets <span className="muted">({allocated}/{capacity} places allouées)</span>
            </h3>
            {categories.length === 0 && (
              <p className="muted">Aucune catégorie créée pour l&apos;instant.</p>
            )}
            {TEMPLATE_TICKET_SUGGESTIONS[template] && (
              <div style={{ margin: "8px 0 4px" }}>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>
                  Suggestions pour ce modèle (remplissent le formulaire ci-dessous, à ajuster puis ajouter) :
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TEMPLATE_TICKET_SUGGESTIONS[template]!
                    .filter((s) => !categories.some((c) => c.name === s.name))
                    .map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        className="btn-sm btn-ghost"
                        onClick={() =>
                          setCatForm({
                            name: s.name,
                            price: "",
                            quantity: String(Math.max(1, Math.round(s.percent * Number(capacity)))),
                            perks: (s.perks ?? []).join("\n"),
                          })
                        }
                      >
                        + {s.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {categories.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{c.name}</span>
                <span className="muted">
                  {formatPrice(c.price_cents, c.currency)} · {c.quantity} places
                </span>
              </div>
            ))}
            <div className="grid2" style={{ marginTop: 14 }}>
              <div>
                <label>Nom</label>
                <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="VIP" />
              </div>
              <div>
                <label>Prix (CAD, 0 = gratuit)</label>
                <input type="number" min={0} step="0.01" value={catForm.price} onChange={(e) => setCatForm({ ...catForm, price: e.target.value })} />
              </div>
            </div>
            <label>Quantité</label>
            <input type="number" min={1} value={catForm.quantity} onChange={(e) => setCatForm({ ...catForm, quantity: e.target.value })} />
            <label>Avantages inclus (un par ligne, optionnel)</label>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Affichés sur la page de l&apos;événement et sur le billet — ex. bouteilles incluses, accès loge, repas.
            </p>
            <textarea
              rows={4}
              value={catForm.perks}
              onChange={(e) => setCatForm({ ...catForm, perks: e.target.value })}
              placeholder={"3 bouteilles de vin rouge\n2 bouteilles de whisky 12 ans d'âge\n4 bouteilles d'eau"}
            />
            <button type="button" className="btn-accent" onClick={addCategory} disabled={!catForm.name || !catForm.quantity}>
              + Ajouter cette catégorie
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>
              ← Retour
            </button>
            <button type="button" className="btn-accent" onClick={continueFromStep2}>
              Continuer
            </button>
          </div>
        </>
      )}

      {step === 2 && type === "private" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{occasion === "kids" ? "Enfants invités" : "Invités"}</h3>
            <p className="muted">
              {occasion === "kids"
                ? "Un enfant par ligne : nom de l'enfant, email du parent (optionnel), table (optionnel), nom du parent/contact (optionnel). Chaque parent recevra un lien personnel au nom de son enfant."
                : "Un invité par ligne : Nom, email (optionnel), table (optionnel), contact/parent (optionnel)."}{" "}
              Les invitations seront envoyées par email seulement à la fin, une fois l&apos;événement finalisé.
            </p>
            <textarea
              rows={6}
              value={guestBulk}
              onChange={(e) => setGuestBulk(e.target.value)}
              placeholder={
                occasion === "kids"
                  ? "Léa Martin, maman.lea@exemple.com, , Sophie Martin (maman de Léa)\nNoah Petit,,, Papa de Noah — 514-555-1234"
                  : "Awa Diop, awa@exemple.com, Table 3\nJean K."
              }
            />
            {guestList.length > 0 && (
              <p className="muted" style={{ marginBottom: 0 }}>
                {guestList.length} invité{guestList.length > 1 ? "s" : ""} prêt{guestList.length > 1 ? "s" : ""} à
                être ajouté{guestList.length > 1 ? "s" : ""}.
              </p>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>
              ← Retour
            </button>
            <button type="button" className="btn-accent" onClick={() => setStep(3)}>
              {guestList.length > 0 ? "Continuer" : "Passer cette étape"}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Identité visuelle</h3>
            <label>Logo de l&apos;association organisatrice (optionnel)</label>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Il apparaîtra sur la page publique, les billets, les invitations et dans tous les emails envoyés à
              vos invités et acheteurs. PNG carré sur fond clair recommandé.
            </p>
            <input
              type="file"
              accept="image/*"
              disabled={logoUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
                e.target.value = "";
              }}
            />
            {logoUploading && <p className="muted">Envoi du logo…</p>}
            {logoDone && <div className="alert ok">Logo enregistré ✓</div>}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Détails complémentaires</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ margin: 0 }}>Description / programme</label>
              <button type="button" className="btn-sm btn-ghost" onClick={generateDescription} disabled={aiBusy}>
                {aiBusy ? "Génération…" : "✨ Générer avec l'IA"}
              </button>
            </div>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            <label>Dress code</label>
            <input value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="Tenue de soirée" />

            <label>Plan de table / notes logistiques (optionnel)</label>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Visible par vos invités sur leur page d&apos;invitation — tables, vestiaire, stationnement…
            </p>
            <textarea
              rows={3}
              value={seatingPlan}
              onChange={(e) => setSeatingPlan(e.target.value)}
              placeholder={"Table 1 : famille proche\nTable 2 : collègues\nStationnement gratuit derrière la salle"}
            />

            {type === "private" && (
              <>
                <label>Question RSVP (optionnel)</label>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  Affichée aux invités au moment de confirmer leur présence. Utile pour les allergies, un besoin de
                  transport, etc.
                </p>
                <input
                  value={rsvpQuestion}
                  onChange={(e) => setRsvpQuestion(e.target.value)}
                  placeholder="Allergies alimentaires ou informations utiles ?"
                />
              </>
            )}

            {type === "ticketed" && (
              <>
                <label>Politique de remboursement</label>
                <select value={refundKind} onChange={(e) => setRefundKind(e.target.value)}>
                  <option value="full">Remboursement total jusqu&apos;à X jours avant</option>
                  <option value="partial">Remboursement partiel</option>
                  <option value="none">Aucun remboursement</option>
                </select>
                {refundKind !== "none" && (
                  <div className="grid2">
                    <div>
                      <label>Jusqu&apos;à combien de jours avant ?</label>
                      <input type="number" min={0} value={refundDays} onChange={(e) => setRefundDays(e.target.value)} />
                    </div>
                    {refundKind === "partial" && (
                      <div>
                        <label>% remboursé</label>
                        <input type="number" min={1} max={100} value={refundPercent} onChange={(e) => setRefundPercent(e.target.value)} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Récapitulatif</h3>
            <p className="muted" style={{ margin: "4px 0" }}>
              <strong>{title}</strong> {venue ? `· ${venue}` : ""}
            </p>
            <p className="muted" style={{ margin: "4px 0" }}>
              {type === "ticketed"
                ? `${categories.length} catégorie${categories.length === 1 ? "" : "s"} de billet, ${allocated}/${capacity} places allouées`
                : `${guestList.length} invité${guestList.length === 1 ? "" : "s"} à inviter`}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={() => setStep(2)} disabled={busy}>
              ← Retour
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => finish(false)} disabled={busy}>
                Enregistrer comme brouillon
              </button>
              <button type="button" className="btn-accent" onClick={() => finish(true)} disabled={busy}>
                {busy ? "Publication…" : "Publier l'événement"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
