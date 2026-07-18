"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, DownloadCloud, Store, Upload } from "lucide-react";
import { API_BASE, api, getToken } from "@/lib/api";
import { COMPANY_SECTORS, SOCIAL_KEYS, SOCIAL_LABELS, parseSocials, type SocialKey } from "@/lib/sponsor";

interface Company {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  public_email: string | null;
  socials: string | null;
  logo_key: string | null;
  listed: number;
}

export default function CompanyPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoBust, setLogoBust] = useState(0);
  const [form, setForm] = useState({
    name: "", sector: "", city: "", description: "", website: "", phone: "", public_email: "",
    listed: false, socials: {} as Partial<Record<SocialKey, string>>,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ company: Company | null }>("/api/company")
      .then((r) => {
        if (r.company) {
          setCompanyId(r.company.id);
          setHasLogo(Boolean(r.company.logo_key));
          setForm({
            name: r.company.name,
            sector: r.company.sector ?? "",
            city: r.company.city ?? "",
            description: r.company.description ?? "",
            website: r.company.website ?? "",
            phone: r.company.phone ?? "",
            public_email: r.company.public_email ?? "",
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
          sector: form.sector || null,
          city: form.city || null,
          description: form.description || null,
          website: form.website || null,
          phone: form.phone || null,
          public_email: form.public_email || null,
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
        <label>Nom de l&apos;entreprise *</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
        <label>Présentation</label>
        <textarea
          rows={4}
          maxLength={1200}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Qui vous êtes, ce que vous faites, les causes que vous aimez soutenir…"
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

      {companyId && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Logo</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {hasLogo ? (
              <img
                src={`${API_BASE}/api/public/companies/${companyId}/logo?v=${logoBust}`}
                alt="Logo"
                style={{ width: 84, height: 84, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", padding: 6 }}
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
                <Upload size={14} /> {uploading ? "Envoi…" : hasLogo ? "Changer le logo" : "Ajouter un logo"}
              </button>
              <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>PNG carré sur fond clair recommandé.</p>
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

      <p className="muted" style={{ textAlign: "center" }}>
        <Store size={14} style={{ verticalAlign: -2 }} />{" "}
        <a href="/sponsors">Voir l&apos;annuaire public des sponsors</a>
      </p>
    </main>
  );
}
