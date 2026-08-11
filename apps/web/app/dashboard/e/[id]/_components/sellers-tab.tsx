"use client";

import { useState } from "react";
import { api, formatPrice } from "@/lib/api";
import { WEB } from "./shared";
import { CopyField } from "./shared-cards";

export function SellersTab({
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

export function SellerCard({
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
