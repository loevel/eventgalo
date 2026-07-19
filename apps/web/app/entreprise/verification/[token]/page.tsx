"use client";

import { use, useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleX } from "lucide-react";
import { API_BASE } from "@/lib/api";

/** Confirmation du lien de vérification d'entreprise (public : le token fait foi). */
export default function CompanyVerificationConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<
    | { status: "pending" }
    | { status: "ok"; companyName: string; domain: string }
    | { status: "error"; message: string }
  >({ status: "pending" });
  // Le token est à usage unique : on empêche le double appel du StrictMode React.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fetch(`${API_BASE}/api/public/companies/verify/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { company_name?: string; domain?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setState({ status: "ok", companyName: data.company_name ?? "", domain: data.domain ?? "" });
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof Error ? err.message : "Erreur" });
      });
  }, [token]);

  return (
    <main className="container narrow" style={{ textAlign: "center", paddingTop: 48 }}>
      {state.status === "pending" && <p className="muted">Vérification en cours…</p>}
      {state.status === "ok" && (
        <div className="card">
          <BadgeCheck size={40} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontSize: 24 }}>Entreprise vérifiée !</h1>
          <p>
            <strong>{state.companyName}</strong> est maintenant vérifiée : vous avez prouvé le contrôle du
            domaine <strong>{state.domain}</strong>. Le badge « Vérifiée » apparaît dès maintenant dans
            l&apos;annuaire et sur vos demandes de sponsoring.
          </p>
          <a className="btn btn-accent" href="/entreprise">Voir mon profil entreprise</a>
        </div>
      )}
      {state.status === "error" && (
        <div className="card">
          <CircleX size={40} style={{ color: "#c0392b" }} />
          <h1 style={{ fontSize: 24 }}>Lien invalide</h1>
          <p className="muted">{state.message}</p>
          <a className="btn btn-ghost" href="/entreprise">Redemander un lien depuis mon profil</a>
        </div>
      )}
    </main>
  );
}
