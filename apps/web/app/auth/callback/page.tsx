"use client";

import { useEffect, useState } from "react";
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
        router.replace("/dashboard");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [router]);

  return (
    <main className="container narrow">
      {error ? (
        <div className="alert err">
          {error} — <a href="/">retour à l&apos;accueil</a>
        </div>
      ) : (
        <p className="muted">Connexion en cours…</p>
      )}
    </main>
  );
}
