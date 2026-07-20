"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

const TABS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/events", label: "Événements" },
  { href: "/admin/finances", label: "Finances" },
  { href: "/admin/settings", label: "Paramètres" },
  { href: "/admin/reviews", label: "Avis sponsors" },
  { href: "/admin/audit", label: "Journal d'audit" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api("/api/admin/overview")
      .then(() => setChecked(true))
      .catch(() => router.replace("/"));
  }, [router]);

  if (!checked) return null;

  return (
    <main className="container landing" style={{ paddingTop: 32 }}>
      <h1 style={{ marginBottom: 4 }}>Administration</h1>
      <p className="muted" style={{ marginTop: 0 }}>Gestion de la plateforme EventGalo.</p>
      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? "active" : ""}>
            {t.label}
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>{children}</div>
    </main>
  );
}
