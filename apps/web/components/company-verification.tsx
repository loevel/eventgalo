"use client";

import { useState } from "react";
import { BadgeCheck, Landmark, MailCheck, Search } from "lucide-react";
import { api } from "@/lib/api";

interface RegistryRecord {
  registry_id: string;
  jurisdiction: string;
  name: string;
  status: string;
  city: string | null;
  entity_type: string | null;
  date_incorporated: string | null;
}

interface Props {
  companyName: string;
  website: string | null;
  verifiedAt: string | null;
  verifiedDomain: string | null;
  registryVerifiedAt: string | null;
  registryName: string | null;
  registryId: string | null;
  registryJurisdiction: string | null;
  onChanged: () => void;
}

const JURISDICTION_LABELS: Record<string, string> = {
  CC: "Fédéral", QC: "Québec", ON: "Ontario", BC: "Colombie-Britannique", AB: "Alberta",
  SK: "Saskatchewan", MB: "Manitoba", NB: "Nouveau-Brunswick", NS: "Nouvelle-Écosse",
  PE: "Île-du-Prince-Édouard", NL: "Terre-Neuve-et-Labrador", YT: "Yukon",
  NT: "Territoires du Nord-Ouest", NU: "Nunavut",
};

export function CompanyVerification({
  companyName, website, verifiedAt, verifiedDomain, registryVerifiedAt,
  registryName, registryId, registryJurisdiction, onChanged,
}: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(companyName);
  const [records, setRecords] = useState<RegistryRecord[] | null>(null);

  const isVerified = Boolean(verifiedAt || registryVerifiedAt);

  async function requestDomainVerification(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    setDebugUrl(null);
    try {
      const res = await api<{ message: string; debug_url?: string }>("/api/company/verify/request", {
        method: "POST",
        body: { email },
      });
      setFlash(res.message);
      if (res.debug_url) setDebugUrl(res.debug_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function searchRegistry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await api<{ records: RegistryRecord[] }>(
        `/api/company/verify/registry/search?q=${encodeURIComponent(query.trim())}`,
      );
      setRecords(res.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function linkRegistry(rec: RegistryRecord) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/company/verify/registry", {
        method: "POST",
        body: { registry_id: rec.registry_id, jurisdiction: rec.jurisdiction },
      });
      setRecords(null);
      setFlash(`Entreprise rattachée au registre : ${rec.name}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <BadgeCheck size={17} /> Vérification de l&apos;entreprise
        {isVerified && <span className="badge ok">Vérifiée</span>}
      </h3>
      <p className="muted">
        Le badge « Vérifiée » rassure les organisateurs : il apparaît dans l&apos;annuaire et sur vos
        demandes de sponsoring. Deux moyens, au choix (les deux, c&apos;est encore mieux).
      </p>

      {flash && <div className="alert ok">{flash}</div>}
      {debugUrl && (
        <div className="alert ok">
          Mode dev : <a href={debugUrl}>lien de vérification</a>
        </div>
      )}
      {error && <div className="alert err">{error}</div>}

      {/* --- 1. Email au domaine du site web --- */}
      <h4 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <MailCheck size={15} /> Par email professionnel
        {verifiedAt && <span className="badge ok" style={{ fontSize: 11 }}>Domaine {verifiedDomain} vérifié</span>}
      </h4>
      {verifiedAt ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Vous avez prouvé le contrôle du domaine <strong>{verifiedDomain}</strong>. Si vous changez le
          site web de votre profil, il faudra refaire la vérification.
        </p>
      ) : website ? (
        <form onSubmit={requestDomainVerification}>
          <p className="muted" style={{ fontSize: 13 }}>
            Recevez un lien à une adresse au domaine de votre site web ({website}) : cliquer le lien
            prouve que l&apos;entreprise vous appartient.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@votre-entreprise.com"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button type="submit" className="btn-ghost btn-sm" disabled={busy} style={{ marginTop: 0 }}>
              Recevoir le lien
            </button>
          </div>
        </form>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          Renseignez d&apos;abord le site web de votre entreprise dans le profil ci-dessous, puis
          enregistrez : la vérification se fait avec une adresse email à ce domaine.
        </p>
      )}

      {/* --- 2. Registre des entreprises --- */}
      <h4 style={{ display: "flex", alignItems: "center", gap: 6, margin: "18px 0 4px" }}>
        <Landmark size={15} /> Par le registre des entreprises
        {registryVerifiedAt && <span className="badge ok" style={{ fontSize: 11 }}>Inscrite au registre</span>}
      </h4>
      {registryVerifiedAt ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Rattachée à <strong>{registryName}</strong> —{" "}
          {JURISDICTION_LABELS[registryJurisdiction ?? ""] ?? registryJurisdiction} n°{registryId}.
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13 }}>
            Retrouvez votre inscription aux Registres d&apos;entreprises du Canada (NEQ, n° de société
            fédérale ou provinciale) : on vérifie qu&apos;elle est active et que le nom correspond.
          </p>
          <form onSubmit={searchRegistry} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom légal ou numéro (NEQ…)"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              type="submit"
              className="btn-ghost btn-sm"
              disabled={busy || query.trim().length < 2}
              style={{ marginTop: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Search size={13} /> Chercher
            </button>
          </form>
          {records && records.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucune inscription active trouvée. Essayez le nom légal exact ou votre numéro d&apos;entreprise.
            </p>
          )}
          {records && records.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {records.map((r) => (
                <div
                  key={`${r.jurisdiction}:${r.registry_id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{r.name}</strong>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {JURISDICTION_LABELS[r.jurisdiction] ?? r.jurisdiction} n°{r.registry_id}
                      {r.city ? ` · ${r.city}` : ""}
                      {r.entity_type ? ` · ${r.entity_type}` : ""}
                    </span>
                  </div>
                  <button className="btn-sm btn-accent" disabled={busy} onClick={() => linkRegistry(r)} style={{ marginTop: 0 }}>
                    C&apos;est nous
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
