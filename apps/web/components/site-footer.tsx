import Link from "next/link";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Produit",
    links: [
      { href: "/connexion", label: "Créer un événement" },
      { href: "/dashboard", label: "Tableau de bord" },
    ],
  },
  {
    title: "Marketplace",
    links: [
      { href: "/sponsors", label: "Annuaire des sponsors" },
      { href: "/prestataires", label: "Annuaire des prestataires" },
      { href: "/opportunites", label: "Événements à sponsoriser" },
      { href: "/entreprise", label: "Créer mon profil" },
    ],
  },
  {
    title: "Communauté",
    links: [
      { href: "/communaute-camerounaise", label: "Galas & associations camerounaises" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/cgu", label: "Conditions générales d'utilisation" },
      { href: "/confidentialite", label: "Politique de confidentialité" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <span className="brand">
            Event<span>Galo</span>
          </span>
          <p className="muted">Invitations, RSVP et billetterie pour vos événements.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="site-footer-col">
            <h4>{col.title}</h4>
            {col.links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="site-footer-bottom">
        <span className="muted">© {new Date().getFullYear()} EventGalo</span>
      </div>
    </footer>
  );
}
