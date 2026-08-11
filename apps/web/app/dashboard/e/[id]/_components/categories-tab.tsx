"use client";

import React, { useState } from "react";
import { api, formatDate, formatPrice } from "@/lib/api";
import { TicketPreview } from "@/components/ticket-preview";
import { parsePerks } from "@/lib/perks";

export function CategoriesTab({
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
