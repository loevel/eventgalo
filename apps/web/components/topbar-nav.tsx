"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken, setToken } from "@/lib/api";

export function TopbarNav() {
  const [connected, setConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const has = Boolean(getToken());
    setConnected(has);
    if (has) {
      api<{ user: { role: string } }>("/api/auth/me")
        .then((r) => setIsAdmin(r.user.role === "admin" || r.user.role === "superadmin"))
        .catch(() => setIsAdmin(false));
    }
  }, []);

  async function logout() {
    try {
      await api("/api/auth/session", { method: "DELETE" });
    } catch {
      // La session est peut-être déjà expirée : on nettoie quand même côté client.
    }
    setToken(null);
    window.location.href = "/";
  }

  return (
    <nav>
      <Link href="/dashboard">Mon espace</Link>
      {connected && isAdmin && <Link href="/admin">Administration</Link>}
      {connected && (
        <button className="btn-sm btn-ghost" onClick={logout}>
          Déconnexion
        </button>
      )}
    </nav>
  );
}
