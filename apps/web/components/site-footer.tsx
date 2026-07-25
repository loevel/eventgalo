import Link from "next/link";

const COLUMNS: { title: string; links: { href: string; label: string }[]; note?: string }[] = [
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
    note: "Villages, associations et diaspora camerounaise au Canada.",
  },
];

const LEGAL_LINKS = [
  { href: "/cgu", label: "CGU" },
  { href: "/confidentialite", label: "Confidentialité" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <span className="brand-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fixe et léger, next/image est superflu ici */}
            <img src="/icon.svg" alt="" className="brand-mark" width={26} height={26} />
            <span className="brand">
              Event<span>Galo</span>
            </span>
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
            {col.note && <p className="site-footer-col-note">{col.note}</p>}
          </div>
        ))}
      </div>
      <div className="site-footer-bottom">
        <span className="muted">© {new Date().getFullYear()} EventGalo</span>
        <div className="site-footer-legal">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
