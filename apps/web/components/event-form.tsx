"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { AddressAutocomplete } from "@/components/address-autocomplete";

export interface EventFormPayload {
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  description: string | null;
  dress_code: string | null;
  parking_available: boolean;
  parking_details: string | null;
  accessibility_available: boolean;
  accessibility_details: string | null;
  age_restriction: string;
  age_restriction_details: string | null;
  day_of_phone: string | null;
  coat_check_available: boolean;
  coat_check_details: string | null;
  community_tag: string | null;
  rsvp_question: string | null;
  seating_plan: string | null;
  agenda: Array<{ time: string; label: string }>;
  capacity: number;
  type?: string;
  status?: string;
  refund_policy: { kind: string; days_before: number; percent: number } | null;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parsePolicy(raw: unknown): { kind?: string; days_before?: number; percent?: number } | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseAgenda(raw: unknown): Array<{ time: string; label: string }> {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  /** Événement existant (mode édition) — absent en création. */
  initial?: Record<string, any>;
  submitLabel: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const initialPolicy = parsePolicy(initial?.refund_policy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<Array<{ time: string; label: string }>>(() => parseAgenda(initial?.agenda));
  const [agendaForm, setAgendaForm] = useState({ time: "", label: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    starts_at: initial?.starts_at ? toLocalInput(initial.starts_at) : "",
    ends_at: initial?.ends_at ? toLocalInput(initial.ends_at) : "",
    venue: initial?.venue ?? "",
    address: initial?.address ?? "",
    description: initial?.description ?? "",
    dress_code: initial?.dress_code ?? "",
    parking_available: Boolean(initial?.parking_available),
    parking_details: initial?.parking_details ?? "",
    accessibility_available: Boolean(initial?.accessibility_available),
    accessibility_details: initial?.accessibility_details ?? "",
    age_restriction: initial?.age_restriction ?? "all",
    age_restriction_details: initial?.age_restriction_details ?? "",
    day_of_phone: initial?.day_of_phone ?? "",
    coat_check_available: Boolean(initial?.coat_check_available),
    coat_check_details: initial?.coat_check_details ?? "",
    community_tag: initial?.community_tag ?? "",
    rsvp_question: initial?.rsvp_question ?? "",
    seating_plan: initial?.seating_plan ?? "",
    capacity: String(initial?.capacity ?? "100"),
    type: initial?.type ?? "private",
    draft: false,
    refund_kind: initialPolicy?.kind ?? "full",
    refund_days: String(initialPolicy?.days_before ?? "7"),
    refund_percent: String(initialPolicy?.percent ?? "50"),
  });

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addAgendaItem() {
    if (!agendaForm.time || !agendaForm.label) return;
    setAgenda((a) => [...a, agendaForm]);
    setAgendaForm({ time: "", label: "" });
  }

  async function generateDescription() {
    if (!initial?.id) return;
    setAiBusy(true);
    try {
      const res = await api<{ text: string }>(`/api/events/${initial.id}/ai/draft`, {
        method: "POST",
        body: { target: "description" },
      });
      set("description", res.text);
    } catch {
      // silencieux : l'organisateur peut réessayer ou écrire lui-même
    } finally {
      setAiBusy(false);
    }
  }

  const [agendaAiBusy, setAgendaAiBusy] = useState(false);

  async function generateAgenda() {
    if (!initial?.id) return;
    setAgendaAiBusy(true);
    try {
      const res = await api<{ agenda: Array<{ time: string; label: string }> }>(`/api/events/${initial.id}/ai/agenda`, {
        method: "POST",
      });
      if (res.agenda.length > 0) setAgenda(res.agenda);
    } catch {
      // silencieux : l'organisateur peut réessayer ou construire son programme manuellement
    } finally {
      setAgendaAiBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
        throw new Error("La date de fin doit être après la date de début.");
      }
      const payload: EventFormPayload = {
        title: form.title,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        venue: form.venue || null,
        address: form.address || null,
        description: form.description || null,
        dress_code: form.dress_code || null,
        parking_available: form.parking_available,
        parking_details: form.parking_available ? form.parking_details || null : null,
        accessibility_available: form.accessibility_available,
        accessibility_details: form.accessibility_available ? form.accessibility_details || null : null,
        age_restriction: form.age_restriction,
        age_restriction_details: form.age_restriction === "other" ? form.age_restriction_details || null : null,
        day_of_phone: form.day_of_phone || null,
        coat_check_available: form.coat_check_available,
        coat_check_details: form.coat_check_available ? form.coat_check_details || null : null,
        community_tag: form.community_tag || null,
        rsvp_question: form.type === "private" ? form.rsvp_question || null : null,
        seating_plan: form.seating_plan || null,
        agenda,
        capacity: Number(form.capacity),
        refund_policy:
          form.type === "ticketed"
            ? {
                kind: form.refund_kind,
                days_before: Number(form.refund_days),
                percent: form.refund_kind === "partial" ? Number(form.refund_percent) : 100,
              }
            : null,
      };
      if (!isEdit) {
        payload.type = form.type;
        if (form.draft) payload.status = "draft";
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <label>Titre *</label>
      <input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Gala annuel 2026" />

      <div className="grid2">
        <div>
          <label>Début (date et heure) *</label>
          <input required type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
        </div>
        <div>
          <label>Fin (optionnel)</label>
          <input type="datetime-local" min={form.starts_at || undefined} value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
        </div>
      </div>

      <div className="grid2">
        <div>
          <label>Lieu</label>
          <input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Salle Le Prestige" />
        </div>
        <div>
          <label>Adresse</label>
          <AddressAutocomplete value={form.address} onChange={(v) => set("address", v)} />
        </div>
      </div>

      <div className="check">
        <input
          id="parking"
          type="checkbox"
          checked={form.parking_available}
          onChange={(e) => set("parking_available", e.target.checked)}
        />
        <label htmlFor="parking" style={{ margin: 0, fontWeight: 400 }}>
          Stationnement disponible sur place
        </label>
      </div>
      {form.parking_available && (
        <>
          <label>Détails du stationnement (optionnel)</label>
          <input
            value={form.parking_details}
            onChange={(e) => set("parking_details", e.target.value)}
            placeholder="Gratuit, 50 places à l'arrière de la salle"
          />
        </>
      )}

      <div className="check">
        <input
          id="accessibility"
          type="checkbox"
          checked={form.accessibility_available}
          onChange={(e) => set("accessibility_available", e.target.checked)}
        />
        <label htmlFor="accessibility" style={{ margin: 0, fontWeight: 400 }}>
          Accès PMR (fauteuil roulant)
        </label>
      </div>
      {form.accessibility_available && (
        <>
          <label>Détails d&apos;accessibilité (optionnel)</label>
          <input
            value={form.accessibility_details}
            onChange={(e) => set("accessibility_details", e.target.value)}
            placeholder="Entrée accessible côté rue, ascenseur disponible"
          />
        </>
      )}

      <div className="check">
        <input
          id="coat-check"
          type="checkbox"
          checked={form.coat_check_available}
          onChange={(e) => set("coat_check_available", e.target.checked)}
        />
        <label htmlFor="coat-check" style={{ margin: 0, fontWeight: 400 }}>
          Vestiaire disponible
        </label>
      </div>
      {form.coat_check_available && (
        <>
          <label>Détails du vestiaire (optionnel)</label>
          <input
            value={form.coat_check_details}
            onChange={(e) => set("coat_check_details", e.target.value)}
            placeholder="Gratuit, à l'entrée"
          />
        </>
      )}

      <div className="grid2">
        <div>
          <label>Restriction d&apos;âge</label>
          <select value={form.age_restriction} onChange={(e) => set("age_restriction", e.target.value)}>
            <option value="all">Tous publics</option>
            <option value="18+">18 ans et plus</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label>Téléphone de contact le jour J (optionnel)</label>
          <input value={form.day_of_phone} onChange={(e) => set("day_of_phone", e.target.value)} placeholder="514 555-0123" />
        </div>
      </div>
      {form.age_restriction === "other" && (
        <>
          <label>Précisez la restriction d&apos;âge</label>
          <input
            value={form.age_restriction_details}
            onChange={(e) => set("age_restriction_details", e.target.value)}
            placeholder="Accompagnement parental requis avant 16 ans"
          />
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ margin: 0 }}>Description</label>
        {isEdit && (
          <button type="button" className="btn-sm btn-ghost" onClick={generateDescription} disabled={aiBusy}>
            {aiBusy ? "Génération…" : "✨ Générer avec l'IA"}
          </button>
        )}
      </div>
      <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <label style={{ margin: 0 }}>Programme de la soirée</label>
        {isEdit && (
          <button type="button" className="btn-sm btn-ghost" onClick={generateAgenda} disabled={agendaAiBusy}>
            {agendaAiBusy ? "Génération…" : "✨ Suggérer avec l'IA"}
          </button>
        )}
      </div>
      {agenda.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {agenda.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span><strong>{item.time}</strong> — {item.label}</span>
              <button
                type="button"
                className="btn-sm btn-ghost"
                onClick={() => setAgenda((a) => a.filter((_, idx) => idx !== i))}
              >
                Retirer
              </button>
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

      <div className="grid2">
        <div>
          <label>Dress code</label>
          <input value={form.dress_code} onChange={(e) => set("dress_code", e.target.value)} placeholder="Tenue de soirée" />
        </div>
        <div>
          <label>Capacité totale de la salle *</label>
          <input required type="number" min={1} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </div>
      </div>

      <label>Association / communauté organisatrice (optionnel)</label>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Affichée sur la page publique de l&apos;événement — ex. « Association des Bandjoun de Montréal »,
        « Communauté bamiléké de l&apos;Ontario »…
      </p>
      <input
        value={form.community_tag}
        onChange={(e) => set("community_tag", e.target.value)}
        maxLength={120}
        placeholder="Association des Bandjoun de Montréal"
      />

      {form.type === "private" && (
        <>
          <label>Question RSVP (optionnel)</label>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Affichée aux invités au moment de confirmer leur présence — allergies, transport, etc.
          </p>
          <input
            value={form.rsvp_question}
            onChange={(e) => set("rsvp_question", e.target.value)}
            placeholder="Allergies alimentaires ou informations utiles ?"
          />
        </>
      )}

      <label>Plan de table / notes logistiques (optionnel)</label>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Visible par vos invités sur leur page d&apos;invitation — tables, vestiaire, stationnement…
      </p>
      <textarea
        rows={3}
        value={form.seating_plan}
        onChange={(e) => set("seating_plan", e.target.value)}
        placeholder={"Table 1 : famille proche\nTable 2 : collègues\nStationnement gratuit derrière la salle"}
      />

      {isEdit ? (
        <p className="muted">
          Type : {form.type === "ticketed" ? "avec billetterie" : "privé"} (non modifiable après création)
        </p>
      ) : (
        <>
          <label>Type d&apos;événement</label>
          <select value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="private">Privé (invitations &amp; RSVP)</option>
            <option value="ticketed">Avec billetterie (catégories, vendeurs, paiements)</option>
          </select>
        </>
      )}

      {form.type === "ticketed" && (
        <>
          <label>Politique de remboursement</label>
          <select value={form.refund_kind} onChange={(e) => set("refund_kind", e.target.value)}>
            <option value="full">Remboursement total jusqu&apos;à X jours avant</option>
            <option value="partial">Remboursement partiel</option>
            <option value="none">Aucun remboursement</option>
          </select>
          {form.refund_kind !== "none" && (
            <div className="grid2">
              <div>
                <label>Jusqu&apos;à combien de jours avant ?</label>
                <input type="number" min={0} value={form.refund_days} onChange={(e) => set("refund_days", e.target.value)} />
              </div>
              {form.refund_kind === "partial" && (
                <div>
                  <label>% remboursé</label>
                  <input type="number" min={1} max={100} value={form.refund_percent} onChange={(e) => set("refund_percent", e.target.value)} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!isEdit && (
        <div className="check">
          <input id="draft" type="checkbox" checked={form.draft} onChange={(e) => set("draft", e.target.checked)} />
          <label htmlFor="draft" style={{ margin: 0, fontWeight: 400 }}>
            Enregistrer comme brouillon (la page publique ne sera pas visible tant que vous ne publiez pas)
          </label>
        </div>
      )}

      {error && <div className="alert err">{error}</div>}
      <button type="submit" className="btn-accent" disabled={busy}>
        {busy ? "Enregistrement…" : submitLabel}
      </button>
    </form>
  );
}
