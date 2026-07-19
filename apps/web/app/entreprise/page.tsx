"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, DownloadCloud, Inbox, Receipt, Store, Upload } from "lucide-react";
import { API_BASE, api, formatDate, formatPrice, getToken } from "@/lib/api";
import { COMPANY_SECTORS, SOCIAL_KEYS, SOCIAL_LABELS, parseSocials, videoEmbedUrl, type SocialKey } from "@/lib/sponsor";
import { CompanyVerification } from "@/components/company-verification";
import { Stars } from "@/components/star-rating";

interface SponsorRequest {
  id: string;
  token: string;
  status: "invited" | "pending" | "confirmed" | "declined";
  amount_cents: number | null;
  paid_at: string | null;
  invite_message: string | null;
  source: string;
  created_at: string;
  confirmed_at: string | null;
  proposed_cents: number | null;
  proposal_status: "pending" | "accepted" | "rejected" | null;
  tier_name: string | null;
  currency: string | null;
  event_title: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  public_slug: string;
  my_rating: number | null;
}

/** L'événement est-il passé ? (fin si connue, sinon début) */
function isPast(r: SponsorRequest): boolean {
  const ref = r.ends_at ?? r.starts_at;
  return Boolean(ref) && new Date(String(ref)).getTime() < Date.now();
}

interface Company {
  id: string;
  name: string;
  kind: "company" | "professional";
  title: string | null;
  affiliation: string | null;
  sector: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  public_email: string | null;
  socials: string | null;
  video_url: string | null;
  logo_key: string | null;
  listed: number;
  verified_at: string | null;
  verified_domain: string | null;
  registry_id: string | null;
  registry_jurisdiction: string | null;
  registry_name: string | null;
  registry_verified_at: string | null;
}

type VerificationState = Pick<
  Company,
  "verified_at" | "verified_domain" | "registry_id" | "registry_jurisdiction" | "registry_name" | "registry_verified_at"
>;

export default function CompanyPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoBust, setLogoBust] = useState(0);
  const [form, setForm] = useState({
    name: "", kind: "company" as "company" | "professional", title: "", affiliation: "",
    sector: "", city: "", description: "", website: "", phone: "", public_email: "", video_url: "",
    listed: false, socials: {} as Partial<Record<SocialKey, string>>,
  });
  const [verif, setVerif] = useState<VerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<SponsorRequest[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ requests: SponsorRequest[] }>("/api/company/requests")
      .then((r) => setRequests(r.requests))
      .catch(() => {});
    api<{ company: Company | null }>("/api/company")
      .then((r) => {
        if (r.company) {
          setCompanyId(r.company.id);
          setHasLogo(Boolean(r.company.logo_key));
          setVerif({
            verified_at: r.company.verified_at,
            verified_domain: r.company.verified_domain,
            registry_id: r.company.registry_id,
            registry_jurisdiction: r.company.registry_jurisdiction,
            registry_name: r.company.registry_name,
            registry_verified_at: r.company.registry_verified_at,
          });
          setForm({
            name: r.company.name,
            kind: r.company.kind === "professional" ? "professional" : "company",
            title: r.company.title ?? "",
            affiliation: r.company.affiliation ?? "",
            sector: r.company.sector ?? "",
            city: r.company.city ?? "",
            description: r.company.description ?? "",
            website: r.company.website ?? "",
            phone: r.company.phone ?? "",
            public_email: r.company.public_email ?? "",
            video_url: r.company.video_url ?? "",
            listed: Boolean(r.company.listed),
            socials: parseSocials(r.company.socials),
          });
        }
        setLoaded(true);
      })
      .catch((e) => {
        if (e.status === 401) router.replace("/");
        else setError(e.message);
      });
  }, [router]);

  useEffect(() => {
    if (!getToken()) router.replace("/#login");
    else load();
  }, [load, router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await api("/api/company", {
        method: "PUT",
        body: {
          name: form.name,
          kind: form.kind,
          title: form.kind === "professional" ? form.title || null : null,
          affiliation: form.kind === "professional" ? form.affiliation || null : null,
          sector: form.sector || null,
          city: form.city || null,
          description: form.description || null,
          website: form.website || null,
          phone: form.phone || null,
          public_email: form.public_email || null,
          video_url: form.video_url || null,
          socials: form.socials,
          listed: form.listed,
        },
      });
      setFlash(form.listed ? "Profil enregistré — visible dans l'annuaire" : "Profil enregistré");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api("/api/company/logo", { method: "POST", body: fd });
      setHasLogo(true);
      setLogoBust(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function importSponsorships() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await api<{ imported: number; prefill: Record<string, string | null> | null }>(
        "/api/company/import",
        { method: "POST", body: {} },
      );
      if (!res.imported) {
        setFlash("Aucun sponsoring trouvé pour votre adresse email.");
      } else {
        if (res.prefill) {
          setForm((f) => ({
            ...f,
            name: f.name || res.prefill?.name || "",
            description: f.description || res.prefill?.description || "",
            website: f.website || res.prefill?.website || "",
            phone: f.phone || res.prefill?.phone || "",
            public_email: f.public_email || res.prefill?.public_email || "",
            city: f.city || res.prefill?.city || "",
            socials: Object.keys(f.socials).length ? f.socials : parseSocials(res.prefill?.socials),
          }));
        }
        setFlash(
          `${res.imported} sponsoring${res.imported > 1 ? "s" : ""} rattaché${res.imported > 1 ? "s" : ""} à votre profil — vérifiez les champs préremplis puis enregistrez.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <main className="container narrow">
        {error ? <div className="alert err">{error}</div> : <p className="muted">Chargement…</p>}
      </main>
    );
  }

  return (
    <main className="container narrow">
      <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Building2 size={24} /> Mon entreprise
      </h1>
      <p className="muted">
        Créez le profil public de votre entreprise pour apparaître dans l&apos;
        <a href="/sponsors">annuaire des sponsors</a> : les associations qui organisent des événements sur
        EventGalo pourront vous découvrir et vous proposer des opportunités de sponsoring.
      </p>

      {flash && <div className="alert ok">{flash}</div>}
      {error && <div className="alert err">{error}</div>}

      {requests.length > 0 && (() => {
        const confirmed = requests.filter((r) => r.status === "confirmed");
        const paid = requests.filter((r) => r.paid_at);
        const totalConfirmed = confirmed.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
        const toRate = confirmed.filter((r) => isPast(r) && r.my_rating == null).length;
        return (
          <>
            <div className="card">
              <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Inbox size={17} /> Mes sponsorings
                {requests.some((r) => r.status === "invited") && (
                  <span className="badge warn">
                    {requests.filter((r) => r.status === "invited").length} à traiter
                  </span>
                )}
                {toRate > 0 && (
                  <span className="badge mut">{toRate} évaluation{toRate > 1 ? "s" : ""} à laisser</span>
                )}
              </h3>
              {confirmed.length > 0 && (
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  {confirmed.length} sponsoring{confirmed.length > 1 ? "s" : ""} confirmé{confirmed.length > 1 ? "s" : ""} ·{" "}
                  {formatPrice(totalConfirmed, confirmed[0]?.currency ?? "CAD")} au total
                  {paid.length > 0 ? ` · ${paid.length} payé${paid.length > 1 ? "s" : ""} en ligne` : ""}
                </p>
              )}
              {requests.map((r) => (
                <div
                  key={r.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong>{r.event_title}</strong>
                    {isPast(r) && <span className="badge mut" style={{ marginLeft: 8, fontSize: 11 }}>Terminé</span>}
                    <span className="muted" style={{ display: "block", fontSize: 13 }}>
                      {r.starts_at ? formatDate(r.starts_at) : ""}
                      {r.venue ? ` · ${r.venue}` : ""}
                      {r.tier_name ? ` · ${r.tier_name}` : ""}
                      {r.amount_cents != null ? ` · ${formatPrice(r.amount_cents, r.currency ?? "CAD")}` : ""}
                    </span>
                    {r.invite_message && r.status === "invited" && (
                      <span className="muted" style={{ display: "block", fontSize: 13, fontStyle: "italic" }}>
                        « {r.invite_message} »
                      </span>
                    )}
                    {r.proposal_status === "pending" && r.proposed_cents != null && (
                      <span className="muted" style={{ display: "block", fontSize: 13 }}>
                        Contre-proposition de {formatPrice(r.proposed_cents, r.currency ?? "CAD")} en attente de réponse
                      </span>
                    )}
                    {r.my_rating != null && (
                      <span style={{ display: "block", marginTop: 2 }}>
                        <Stars value={r.my_rating} size={11} />
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {r.paid_at && <span className="badge ok">Payé</span>}
                    <span
                      className={`badge ${
                        r.status === "confirmed" ? "ok" : r.status === "pending" ? "warn" : r.status === "declined" ? "err" : "mut"
                      }`}
                    >
                      {r.status === "confirmed"
                        ? "Confirmé"
                        : r.status === "pending"
                          ? "Engagé"
                          : r.status === "declined"
                            ? "Décliné"
                            : "Nouvelle demande"}
                    </span>
                    {r.status !== "declined" && (
                      <a className="btn btn-ghost btn-sm" href={`/sp/${r.token}`} style={{ marginTop: 0 }}>
                        {r.status === "invited"
                          ? "Voir la proposition"
                          : r.status === "confirmed" && isPast(r) && r.my_rating == null
                            ? "Évaluer"
                            : "Ouvrir"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {paid.length > 0 && (
              <div className="card">
                <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Receipt size={17} /> Paiements
                </h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  Vos sponsorings réglés en ligne via EventGalo — pour votre comptabilité.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Événement</th>
                      <th>Palier</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paid.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.paid_at)}</td>
                        <td><a href={`/sp/${r.token}`}>{r.event_title}</a></td>
                        <td>{r.tier_name ?? "—"}</td>
                        <td>{r.amount_cents != null ? formatPrice(r.amount_cents, r.currency ?? "CAD") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {companyId && (
        <div className="card">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <DownloadCloud size={17} /> Vous avez déjà sponsorisé un événement ?
          </h3>
          <p className="muted">
            Si vous avez déjà été sponsor via EventGalo avec cette adresse email, on rattache ces sponsorings à
            votre profil et on préremplit vos informations.
          </p>
          <button className="btn-ghost btn-sm" disabled={busy} onClick={importSponsorships}>
            Retrouver mes sponsorings
          </button>
        </div>
      )}

      <form className="card" onSubmit={save}>
        <label>Type de profil</label>
        <div className="kind-picker">
          {(
            [
              ["company", "Entreprise", "Commerce, PME, organisation — le profil porte le nom de l'entreprise."],
              ["professional", "Professionnel indépendant", "Courtier, conseiller, artisan… — le profil porte votre nom, avec votre métier et votre bannière."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className={`kind-option${form.kind === value ? " kind-selected" : ""}`}>
              <input
                type="radio"
                name="kind"
                value={value}
                checked={form.kind === value}
                onChange={() => setForm({ ...form, kind: value })}
              />
              <span>
                <strong>{label}</strong>
                <span className="muted" style={{ display: "block", fontSize: 12 }}>{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <label>{form.kind === "professional" ? "Votre nom *" : "Nom de l'entreprise *"}</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={form.kind === "professional" ? "Jean Dupont" : undefined}
        />
        {form.kind === "professional" && (
          <div className="grid2">
            <div>
              <label>Votre métier</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Courtier immobilier résidentiel"
              />
            </div>
            <div>
              <label>Bannière / réseau (optionnel)</label>
              <input
                value={form.affiliation}
                onChange={(e) => setForm({ ...form, affiliation: e.target.value })}
                placeholder="RE/MAX Québec"
              />
            </div>
          </div>
        )}
        <div className="grid2">
          <div>
            <label>Secteur d&apos;activité</label>
            <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
              <option value="">—</option>
              {COMPANY_SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Ville / région</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Montréal" />
          </div>
        </div>
        <label>{form.kind === "professional" ? "Présentez-vous" : "Présentation"}</label>
        <textarea
          rows={4}
          maxLength={1200}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={
            form.kind === "professional"
              ? "Votre parcours, votre approche, les causes qui vous tiennent à cœur…"
              : "Qui vous êtes, ce que vous faites, les causes que vous aimez soutenir…"
          }
        />
        <div className="grid2">
          <div>
            <label>Site web</label>
            <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <label>Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <label>Email public</label>
        <input type="email" value={form.public_email} onChange={(e) => setForm({ ...form, public_email: e.target.value })} />

        <label style={{ marginTop: 16 }}>Réseaux sociaux</label>
        <div className="grid2">
          {SOCIAL_KEYS.map((key) => (
            <div key={key}>
              <label style={{ fontWeight: 400, fontSize: 12, margin: "8px 0 2px" }}>{SOCIAL_LABELS[key]}</label>
              <input
                type="url"
                value={form.socials[key] ?? ""}
                onChange={(e) => setForm({ ...form, socials: { ...form.socials, [key]: e.target.value } })}
                placeholder="https://…"
              />
            </div>
          ))}
        </div>

        <label style={{ marginTop: 16 }}>Vidéo de présentation (lien YouTube ou Vimeo, optionnel)</label>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Présentation, contacts, réseaux et vidéo préremplissent automatiquement votre vitrine à chaque
          nouveau sponsoring — plus rien à ressaisir.
        </p>
        <input
          type="url"
          value={form.video_url}
          onChange={(e) => setForm({ ...form, video_url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        {form.video_url && !videoEmbedUrl(form.video_url) && (
          <p className="muted" style={{ color: "var(--err)", fontSize: 13 }}>
            Lien non reconnu — collez une URL YouTube ou Vimeo.
          </p>
        )}

        <div className="check" style={{ marginTop: 18 }}>
          <input
            id="listed"
            type="checkbox"
            checked={form.listed}
            onChange={(e) => setForm({ ...form, listed: e.target.checked })}
          />
          <label htmlFor="listed" style={{ margin: 0, fontWeight: 400 }}>
            <strong>Apparaître dans l&apos;annuaire public des sponsors.</strong> Les organisateurs d&apos;événements
            pourront voir votre profil et vous inviter à sponsoriser leurs événements.
          </label>
        </div>

        <button type="submit" className="btn-accent" disabled={busy}>
          {busy ? "Enregistrement…" : companyId ? "Enregistrer" : "Créer mon profil"}
        </button>
      </form>

      {companyId && verif && (
        <CompanyVerification
          kind={form.kind}
          companyName={form.name}
          website={form.website || null}
          verifiedAt={verif.verified_at}
          verifiedDomain={verif.verified_domain}
          registryVerifiedAt={verif.registry_verified_at}
          registryName={verif.registry_name}
          registryId={verif.registry_id}
          registryJurisdiction={verif.registry_jurisdiction}
          onChanged={load}
        />
      )}

      {companyId && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{form.kind === "professional" ? "Votre photo" : "Logo"}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {hasLogo ? (
              <img
                src={`${API_BASE}/api/public/companies/${companyId}/logo?v=${logoBust}`}
                alt={form.kind === "professional" ? "Photo" : "Logo"}
                style={
                  form.kind === "professional"
                    ? { width: 84, height: 84, objectFit: "cover", borderRadius: "50%", border: "1px solid var(--line)" }
                    : { width: 84, height: 84, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 6 }
                }
              />
            ) : (
              <div className="sponsor-name-fallback">{form.name.charAt(0).toUpperCase() || "?"}</div>
            )}
            <div>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Upload size={14} />{" "}
                {uploading
                  ? "Envoi…"
                  : hasLogo
                    ? form.kind === "professional" ? "Changer la photo" : "Changer le logo"
                    : form.kind === "professional" ? "Ajouter votre photo" : "Ajouter un logo"}
              </button>
              <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                {form.kind === "professional"
                  ? "Un portrait professionnel, cadré sur le visage — il apparaîtra en rond dans l'annuaire."
                  : "PNG carré sur fond clair recommandé."}
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
            />
          </div>
        </div>
      )}

      <div className="card directory-cta">
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Trouvez vos prochains sponsorings</h3>
          <p className="muted" style={{ margin: 0 }}>
            Parcourez les événements qui cherchent des sponsors et proposez votre entreprise directement.
          </p>
        </div>
        <a className="btn btn-accent" href="/opportunites" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
          Voir les opportunités
        </a>
      </div>

      <p className="muted" style={{ textAlign: "center" }}>
        <Store size={14} style={{ verticalAlign: -2 }} />{" "}
        <a href="/sponsors">Voir l&apos;annuaire public des sponsors</a>
      </p>
    </main>
  );
}
