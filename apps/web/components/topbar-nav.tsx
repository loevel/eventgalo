"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { api, getToken, setToken } from "@/lib/api";
import { NotificationBell } from "@/components/notification-bell";

const PUBLIC_LINK_KEYS = ["sponsors", "vendors", "opportunities"] as const;
const PUBLIC_LINK_HREFS = {
  sponsors: "/sponsors",
  vendors: "/prestataires",
  opportunities: "/opportunites",
};

export function TopbarNav() {
  const t = useTranslations("TopbarNav");
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
      <NotificationBell />
      <Link href="/dashboard">{t("myDashboard")}</Link>
      {isAdmin && <Link href="/admin">{t("administration")}</Link>}
      <button className="btn-sm btn-ghost" onClick={logout}>
        {t("logout")}
      </button>
    </>
  ) : (
    <Link href="/connexion" className="btn-sm btn-accent">
      {t("login")}
    </Link>
  );

  return (
    <>
      <nav className="topbar-links">
        {PUBLIC_LINK_KEYS.map((key) => (
          <Link
            key={key}
            href={PUBLIC_LINK_HREFS[key]}
            aria-current={pathname === PUBLIC_LINK_HREFS[key] ? "page" : undefined}
          >
            {t(key)}
          </Link>
        ))}
        <span className="topbar-sep" aria-hidden="true" />
        {authLinks}
      </nav>
      <button
        type="button"
        className="topbar-toggle"
        aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {menuOpen && (
        <div className="topbar-mobile-panel">
          {PUBLIC_LINK_KEYS.map((key) => (
            <Link
              key={key}
              href={PUBLIC_LINK_HREFS[key]}
              aria-current={pathname === PUBLIC_LINK_HREFS[key] ? "page" : undefined}
            >
              {t(key)}
            </Link>
          ))}
          <hr />
          {connected ? (
            <>
              <NotificationBell />
              <Link href="/dashboard">{t("myDashboard")}</Link>
              {isAdmin && <Link href="/admin">{t("administration")}</Link>}
              <button className="btn-sm btn-ghost" onClick={logout}>
                {t("logout")}
              </button>
            </>
          ) : (
            <Link href="/connexion" className="btn-sm btn-accent">
              {t("login")}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
