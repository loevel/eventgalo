"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { api, getToken, setToken } from "@/lib/api";

const PUBLIC_LINKS = [
  { href: "/sponsors", label: "Sponsors" },
  { href: "/prestataires", label: "Prestataires" },
  { href: "/opportunites", label: "Opportunités" },
];

export function TopbarNav() {
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Le layout racine (et donc ce composant) reste monté pendant les navigations
  // côté client : on revérifie la session à chaque changement de page pour capter
  // une connexion qui vient de se faire (callback du lien magique → /dashboard).
  useEffect(() => {
    const has = Boolean(getToken());
    setConnected(has);
    if (has) {
      api<{ user: { role: string } }>("/api/auth/me")
        .then((r) => setIsAdmin(r.user.role === "admin" || r.user.role === "superadmin"))
        .catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await api("/api/auth/session", { method: "DELETE" });
    } catch {
      // La session est peut-être déjà expirée : on nettoie quand même côté client.
    }
    setToken(null);
    window.location.href = "/";
  }

  const authLinks = connected ? (
    <>
      <Link href="/dashboard">Mon espace</Link>
      {isAdmin && <Link href="/admin">Administration</Link>}
      <button className="btn-sm btn-ghost" onClick={logout}>
        Déconnexion
      </button>
    </>
  ) : (
    <Link href="/connexion" className="btn-sm btn-accent">
      Connexion
    </Link>
  );

  return (
    <>
      <nav className="topbar-links">
        {PUBLIC_LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
        <span className="topbar-sep" aria-hidden="true" />
        {authLinks}
      </nav>
      <button
        type="button"
        className="topbar-toggle"
        aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {menuOpen && (
        <div className="topbar-mobile-panel">
          {PUBLIC_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <hr />
          {connected ? (
            <>
              <Link href="/dashboard">Mon espace</Link>
              {isAdmin && <Link href="/admin">Administration</Link>}
              <button className="btn-sm btn-ghost" onClick={logout}>
                Déconnexion
              </button>
            </>
          ) : (
            <Link href="/connexion" className="btn-sm btn-accent">
              Connexion
            </Link>
          )}
        </div>
      )}
    </>
  );
}
