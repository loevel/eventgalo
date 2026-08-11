"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { WEB } from "./shared";

export function GuestsTab({
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
