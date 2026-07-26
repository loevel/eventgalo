"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError("Lien invalide");
      return;
    }
    api<{ token: string }>("/api/auth/verify", { method: "POST", body: { token }, auth: false })
      .then((res) => {
        setToken(res.token);
        const next = sessionStorage.getItem("eg_login_next");
        sessionStorage.removeItem("eg_login_next");
        router.replace(next || "/dashboard");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [router]);

  return (
    <main className="container narrow">
      {error ? (
        <div className="alert err">
          {error} — <Link href="/">retour à l&apos;accueil</Link>
        </div>
      ) : (
        <p className="muted">Connexion en cours…</p>
      )}
    </main>
  );
}
