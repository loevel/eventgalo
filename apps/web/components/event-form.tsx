"use client";

import { useState } from "react";

export interface EventFormPayload {
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  description: string | null;
  dress_code: string | null;
  rsvp_question: string | null;
  seating_plan: string | null;
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
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    starts_at: initial?.starts_at ? toLocalInput(initial.starts_at) : "",
    ends_at: initial?.ends_at ? toLocalInput(initial.ends_at) : "",
    venue: initial?.venue ?? "",
    address: initial?.address ?? "",
    description: initial?.description ?? "",
    dress_code: initial?.dress_code ?? "",
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
        rsvp_question: form.type === "private" ? form.rsvp_question || null : null,
        seating_plan: form.seating_plan || null,
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
          <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 rue…, Montréal" />
        </div>
      </div>

      <label>Description / programme</label>
      <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />

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
