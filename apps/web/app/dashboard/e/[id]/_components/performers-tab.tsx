"use client";

import React, { useState, useRef } from "react";
import { API_BASE, api } from "@/lib/api";
import { PERFORMER_ROLES } from "@/lib/sponsor";

/** Une photo (slot 1 ou 2) d'un artiste : upload, remplacement, suppression. */
export function PerformerPhoto({
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
          src={`${API_BASE}/api/public/media/${mediaId}/file?thumb=1`}
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
export function PerformersTab({
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
