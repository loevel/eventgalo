"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, formatPrice } from "@/lib/api";
import { AddressAutocomplete } from "@/components/address-autocomplete";

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

interface AgendaItem {
  time: string;
  label: string;
}

interface EventTemplate {
  label: string;
  dressCode?: string;
  agenda?: AgendaItem[];
}

const TEMPLATES: Record<TemplateKey, EventTemplate> = {
  generic: { label: "Générique / autre" },
  wedding: {
    label: "💍 Mariage",
    dressCode: "Tenue de soirée / élégante",
    agenda: [
      { time: "18 h 00", label: "Cérémonie" },
      { time: "19 h 00", label: "Cocktail de bienvenue" },
      { time: "20 h 00", label: "Repas" },
      { time: "21 h 30", label: "Ouverture de bal" },
      { time: "22 h 00", label: "Soirée dansante" },
    ],
  },
  birthday_adult: {
    label: "🎂 Anniversaire",
    dressCode: "Décontracté chic",
    agenda: [
      { time: "19 h 00", label: "Accueil des invités" },
      { time: "19 h 30", label: "Apéritif" },
      { time: "20 h 30", label: "Repas" },
      { time: "21 h 30", label: "Gâteau et discours" },
      { time: "22 h 00", label: "Musique et danse" },
    ],
  },
  birthday_kids: { label: "🎈 Anniversaire d'enfant" },
  gala: {
    label: "🏆 Gala",
    dressCode: "Tenue de gala / cravate noire",
    agenda: [
      { time: "18 h 00", label: "Accueil et cocktail" },
      { time: "19 h 00", label: "Mot d'ouverture" },
      { time: "19 h 30", label: "Souper" },
      { time: "20 h 30", label: "Remise de prix / animation" },
      { time: "21 h 30", label: "Soirée dansante" },
    ],
  },
  conference: {
    label: "🎤 Conférence",
    dressCode: "Tenue professionnelle",
    agenda: [
      { time: "08 h 30", label: "Accueil et inscription" },
      { time: "09 h 00", label: "Mot de bienvenue" },
      { time: "09 h 15", label: "Conférences" },
      { time: "12 h 00", label: "Pause déjeuner" },
      { time: "13 h 30", label: "Ateliers" },
      { time: "16 h 30", label: "Clôture" },
    ],
  },
};

function formatPreviewDate(local: string): string {
  if (!local) return "Date à venir";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date(local));
}

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
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [parkingDetails, setParkingDetails] = useState("");
  const [accessibilityAvailable, setAccessibilityAvailable] = useState(false);
  const [accessibilityDetails, setAccessibilityDetails] = useState("");
  const [ageRestriction, setAgeRestriction] = useState<"all" | "18+" | "other">("all");
  const [ageRestrictionDetails, setAgeRestrictionDetails] = useState("");
  const [dayOfPhone, setDayOfPhone] = useState("");
  const [coatCheckAvailable, setCoatCheckAvailable] = useState(false);
  const [coatCheckDetails, setCoatCheckDetails] = useState("");

  // Étape 2 — billetterie
  const [categories, setCategories] = useState<Category[]>([]);
  const [catForm, setCatForm] = useState({ name: "", price: "", quantity: "", perks: "" });

  // Étape 2 — invités (saisis localement, envoyés seulement à la fin)
  const [guestBulk, setGuestBulk] = useState("");
  const guestList = parseGuestLines(guestBulk);

  // Étape 3 — récapitulatif
  const [description, setDescription] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [communityTag, setCommunityTag] = useState("");
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [agendaForm, setAgendaForm] = useState({ time: "", label: "" });
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

  const [agendaAiBusy, setAgendaAiBusy] = useState(false);

  async function generateAgenda() {
    if (!eventId) return;
    setAgendaAiBusy(true);
    setError(null);
    try {
      const res = await api<{ agenda: AgendaItem[] }>(`/api/events/${eventId}/ai/agenda`, { method: "POST" });
      if (res.agenda.length > 0) setAgenda(res.agenda);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAgendaAiBusy(false);
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
    setAgenda(t.agenda ?? []);
  }

  function addAgendaItem() {
    if (!agendaForm.time || !agendaForm.label) return;
    setAgenda((a) => [...a, agendaForm]);
    setAgendaForm({ time: "", label: "" });
  }

  function removeAgendaItem(i: number) {
    setAgenda((a) => a.filter((_, idx) => idx !== i));
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
        parking_available: parkingAvailable,
        parking_details: parkingAvailable ? parkingDetails || null : null,
        accessibility_available: accessibilityAvailable,
        accessibility_details: accessibilityAvailable ? accessibilityDetails || null : null,
        age_restriction: ageRestriction,
        age_restriction_details: ageRestriction === "other" ? ageRestrictionDetails || null : null,
        day_of_phone: dayOfPhone || null,
        coat_check_available: coatCheckAvailable,
        coat_check_details: coatCheckAvailable ? coatCheckDetails || null : null,
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
          community_tag: communityTag || null,
          seating_plan: seatingPlan || null,
          agenda,
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
              <AddressAutocomplete value={address} onChange={setAddress} />
            </div>
          </div>

          <div className="check">
            <input
              id="parking"
              type="checkbox"
              checked={parkingAvailable}
              onChange={(e) => setParkingAvailable(e.target.checked)}
            />
            <label htmlFor="parking" style={{ margin: 0, fontWeight: 400 }}>
              Stationnement disponible sur place
            </label>
          </div>
          {parkingAvailable && (
            <>
              <label>Détails du stationnement (optionnel)</label>
              <input
                value={parkingDetails}
                onChange={(e) => setParkingDetails(e.target.value)}
                placeholder="Gratuit, 50 places à l'arrière de la salle"
              />
            </>
          )}

          <div className="check">
            <input
              id="accessibility"
              type="checkbox"
              checked={accessibilityAvailable}
              onChange={(e) => setAccessibilityAvailable(e.target.checked)}
            />
            <label htmlFor="accessibility" style={{ margin: 0, fontWeight: 400 }}>
              Accès PMR (fauteuil roulant)
            </label>
          </div>
          {accessibilityAvailable && (
            <>
              <label>Détails d&apos;accessibilité (optionnel)</label>
              <input
                value={accessibilityDetails}
                onChange={(e) => setAccessibilityDetails(e.target.value)}
                placeholder="Entrée accessible côté rue, ascenseur disponible"
              />
            </>
          )}

          <div className="check">
            <input
              id="coat-check"
              type="checkbox"
              checked={coatCheckAvailable}
              onChange={(e) => setCoatCheckAvailable(e.target.checked)}
            />
            <label htmlFor="coat-check" style={{ margin: 0, fontWeight: 400 }}>
              Vestiaire disponible
            </label>
          </div>
          {coatCheckAvailable && (
            <>
              <label>Détails du vestiaire (optionnel)</label>
              <input
                value={coatCheckDetails}
                onChange={(e) => setCoatCheckDetails(e.target.value)}
                placeholder="Gratuit, à l'entrée"
              />
            </>
          )}

          <div className="grid2">
            <div>
              <label>Restriction d&apos;âge</label>
              <select value={ageRestriction} onChange={(e) => setAgeRestriction(e.target.value as "all" | "18+" | "other")}>
                <option value="all">Tous publics</option>
                <option value="18+">18 ans et plus</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div>
              <label>Téléphone de contact le jour J (optionnel)</label>
              <input value={dayOfPhone} onChange={(e) => setDayOfPhone(e.target.value)} placeholder="514 555-0123" />
            </div>
          </div>
          {ageRestriction === "other" && (
            <>
              <label>Précisez la restriction d&apos;âge</label>
              <input
                value={ageRestrictionDetails}
                onChange={(e) => setAgeRestrictionDetails(e.target.value)}
                placeholder="Accompagnement parental requis avant 16 ans"
              />
            </>
          )}

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
          <div className="event-preview-card">
            <span className="event-preview-badge">
              {type === "ticketed" ? "🎟️ Billetterie" : "💌 Invitation"} · Aperçu en direct
            </span>
            <h2>{title || "Titre de votre événement"}</h2>
            <p className="event-preview-meta">
              {formatPreviewDate(startsAt)}
              {venue ? ` · ${venue}` : ""}
              {dressCode ? ` · ${dressCode}` : ""}
            </p>
            {description && <p className="event-preview-desc">{description}</p>}
            {agenda.length > 0 && (
              <ul className="event-preview-agenda">
                {agenda.map((item, i) => (
                  <li key={i}><strong>{item.time}</strong> {item.label}</li>
                ))}
              </ul>
            )}
          </div>

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
              <label style={{ margin: 0 }}>Description</label>
              <button type="button" className="btn-sm btn-ghost" onClick={generateDescription} disabled={aiBusy}>
                {aiBusy ? "Génération…" : "✨ Générer avec l'IA"}
              </button>
            </div>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            <label>Dress code</label>
            <input value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="Tenue de soirée" />

            <label>Association / communauté organisatrice (optionnel)</label>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Affichée sur la page publique de l&apos;événement — ex. « Association des Bandjoun de Montréal »,
              « Communauté bamiléké de l'Ontario »…
            </p>
            <input
              value={communityTag}
              onChange={(e) => setCommunityTag(e.target.value)}
              maxLength={120}
              placeholder="Association des Bandjoun de Montréal"
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <label style={{ margin: 0 }}>Programme de la soirée (optionnel)</label>
              <button type="button" className="btn-sm btn-ghost" onClick={generateAgenda} disabled={agendaAiBusy}>
                {agendaAiBusy ? "Génération…" : "✨ Suggérer avec l'IA"}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Heure par heure — affiché comme une frise sur la page publique.
            </p>
            {agenda.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {agenda.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <span><strong>{item.time}</strong> — {item.label}</span>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => removeAgendaItem(i)}>Retirer</button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid2">
              <div>
                <label>Heure</label>
                <input value={agendaForm.time} onChange={(e) => setAgendaForm({ ...agendaForm, time: e.target.value })} placeholder="19 h 00" />
              </div>
              <div>
                <label>Ce qui se passe</label>
                <input value={agendaForm.label} onChange={(e) => setAgendaForm({ ...agendaForm, label: e.target.value })} placeholder="Cocktail de bienvenue" />
              </div>
            </div>
            <button type="button" className="btn-sm btn-ghost" onClick={addAgendaItem} disabled={!agendaForm.time || !agendaForm.label}>
              + Ajouter au programme
            </button>

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

          <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              Besoin d&apos;un photographe, d&apos;une salle, d&apos;un traiteur pour cet événement ?
            </p>
            <a className="btn btn-ghost btn-sm" href="/prestataires" target="_blank" rel="noreferrer">
              Parcourir l&apos;annuaire des prestataires
            </a>
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
