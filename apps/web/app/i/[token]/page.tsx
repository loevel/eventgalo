"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE, api, formatDate } from "@/lib/api";
import { MediaGallery, type MediaItem } from "@/components/media-gallery";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/public/invite/${token}`, { auth: false })
      .then((d: any) => {
        setData(d);
        setEditName(d.guest.name ?? "");
        setEditEmail(d.guest.email ?? "");
        setEditPhone(d.guest.phone ?? "");
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function saveContact() {
    setBusy(true);
    setContactError(null);
    try {
      const res = await api<{ guest: Record<string, any> }>(`/api/public/invite/${token}`, {
        method: "PATCH",
        auth: false,
        body: { name: editName, email: editEmail || null, phone: editPhone || null },
      });
      setData((d) => (d ? { ...d, guest: res.guest } : d));
      setEditingContact(false);
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function rsvp(status: "yes" | "no") {
    setBusy(true);
    try {
      await api(`/api/public/invite/${token}/rsvp`, {
        method: "POST",
        auth: false,
        body: { status, consent: true, note: note.trim() || undefined },
      });
      setData((d) => (d ? { ...d, guest: { ...d.guest, rsvp_status: status, rsvp_note: note.trim() || d.guest.rsvp_note } } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="container narrow"><div className="alert err">{error}</div></main>;
  if (!data) return <main className="container narrow"><p className="muted">Chargement…</p></main>;

  const { guest, event: ev } = data;
  return (
    <main className="container narrow">
      <div className="hero" style={{ paddingBottom: 8 }}>
        {ev.logo_media_id && (
          <img
            src={`${API_BASE}/api/public/media/${ev.logo_media_id}/file`}
            alt={`Logo — ${ev.title}`}
            style={{
              width: 72, height: 72, objectFit: "contain", borderRadius: 14,
              border: "1px solid var(--line)", background: "#fff", padding: 6, marginBottom: 10,
            }}
          />
        )}
        <p className="muted" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12 }}>
          Invitation personnelle
        </p>
        <h1>Bonjour {guest.name} 👋</h1>
        <p>
          Vous êtes invité·e à <strong>{ev.title}</strong>
        </p>
        {guest.guardian_name && (
          <p className="muted" style={{ fontSize: 13 }}>
            À l&apos;attention de {guest.guardian_name}
          </p>
        )}
      </div>

      <div className="card">
        <p>
          📅 <strong>{formatDate(ev.starts_at)}</strong>
          {ev.ends_at ? <><br />🕗 Jusqu&apos;à {formatDate(ev.ends_at)}</> : null}
          {ev.venue ? <><br />📍 {ev.venue}{ev.address ? `, ${ev.address}` : ""}</> : null}
          {guest.table_name ? <><br />🪑 Votre table : <strong>{guest.table_name}</strong></> : null}
          {ev.dress_code ? <><br />👗 Dress code : {ev.dress_code}</> : null}
          {ev.parking_available ? <><br />🅿️ {ev.parking_details || "Stationnement disponible"}</> : null}
          {ev.accessibility_available ? <><br />♿ {ev.accessibility_details || "Accès PMR"}</> : null}
          {ev.coat_check_available ? <><br />🧥 {ev.coat_check_details || "Vestiaire disponible"}</> : null}
          {ev.age_restriction && ev.age_restriction !== "all" ? (
            <><br />🔞 {ev.age_restriction === "18+" ? "18 ans et plus" : ev.age_restriction_details || "Restriction d'âge"}</>
          ) : null}
          {ev.day_of_phone ? <><br />📞 Contact jour J : {ev.day_of_phone}</> : null}
        </p>
        {ev.description && <p style={{ whiteSpace: "pre-wrap" }}>{ev.description}</p>}
        {ev.seating_plan && (
          <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            ℹ️ {ev.seating_plan}
          </p>
        )}
        <a className="btn-ghost btn-sm" href={`${API_BASE}/api/public/invite/${token}/ics`}>
          📅 Ajouter à mon agenda
        </a>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mes coordonnées</h3>
        {editingContact ? (
          <>
            <label htmlFor="edit-name">Nom</label>
            <input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <label htmlFor="edit-email">Email</label>
            <input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            <label htmlFor="edit-phone">Téléphone</label>
            <input id="edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            {contactError && <div className="alert err">{contactError}</div>}
            <button className="btn-sm btn-accent" disabled={busy} onClick={saveContact}>
              Enregistrer
            </button>{" "}
            <button className="btn-sm btn-ghost" disabled={busy} onClick={() => setEditingContact(false)}>
              Annuler
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: "4px 0" }}>
              {guest.name}
              {guest.email ? <><br />{guest.email}</> : null}
              {guest.phone ? <><br />{guest.phone}</> : null}
            </p>
            <button className="btn-sm btn-ghost" onClick={() => setEditingContact(true)}>
              ✏️ Corriger mes coordonnées
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        {guest.rsvp_status === "pending" ? (
          <>
            <h3 style={{ marginTop: 0 }}>Confirmez-vous votre présence ?</h3>
            <p className="muted" style={{ fontSize: 12 }}>
              En confirmant, vous consentez à l&apos;utilisation de vos coordonnées pour cet événement
              (supprimées 30 jours après).
            </p>
            {ev.rsvp_question && (
              <div style={{ textAlign: "left", marginBottom: 12 }}>
                <label>{ev.rsvp_question}</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            <button className="btn-accent" disabled={busy} onClick={() => rsvp("yes")}>
              ✓ Je serai présent·e
            </button>{" "}
            <button className="btn-ghost" disabled={busy} onClick={() => rsvp("no")} style={{ marginLeft: 8 }}>
              Je ne pourrai pas venir
            </button>
          </>
        ) : guest.rsvp_status === "yes" ? (
          <>
            <div className="alert ok">✓ Présence confirmée — merci !</div>
            {guest.rsvp_note && (
              <p className="muted" style={{ fontSize: 13 }}>
                {ev.rsvp_question ?? "Votre réponse"} : {guest.rsvp_note}
              </p>
            )}
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => rsvp("no")}>
              Finalement je ne peux plus venir
            </button>
          </>
        ) : (
          <>
            <div className="alert info">Vous avez décliné l&apos;invitation.</div>
            <button className="btn-ghost btn-sm" disabled={busy} onClick={() => rsvp("yes")}>
              Changer d&apos;avis — je viens !
            </button>
          </>
        )}
      </div>

      {(data.announcements as any[]).length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📢 Annonces de l&apos;hôte</h3>
          {(data.announcements as any[]).map((a, i) => (
            <p key={i}>
              {a.body} <span className="muted">— {formatDate(a.created_at)}</span>
            </p>
          ))}
        </div>
      )}

      <PhotosCard token={token} />
    </main>
  );
}

function PhotosCard({ token }: { token: string }) {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ media: MediaItem[]; guest_id: string }>(`/api/public/invite/${token}/media`, { auth: false })
      .then((r) => {
        setMedia(r.media);
        setGuestId(r.guest_id);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(load, [load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/public/invite/${token}/media`, { method: "POST", auth: false, body: fd });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>📷 Photos</h3>
      <p className="muted">Partagez vos photos de l&apos;événement avec les autres invités (max 20 photos, 10 Mo chacune).</p>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      {uploading && <p className="muted">Envoi en cours…</p>}
      {error && <div className="alert err">{error}</div>}
      {media === null ? (
        <p className="muted">Chargement…</p>
      ) : (
        <MediaGallery
          media={media}
          canDelete={(m) => m.guest_id === guestId}
          onDelete={(m) =>
            api(`/api/public/invite/${token}/media/${m.id}`, { method: "DELETE", auth: false })
              .then(load)
              .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
          }
        />
      )}
    </div>
  );
}
