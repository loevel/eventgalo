import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Handshake, MapPin, PartyPopper, Ticket, Users } from "lucide-react";

const TITLE = "Galas et associations culturelles camerounaises au Canada";
const DESCRIPTION =
  "EventGalo accompagne les associations et communautés camerounaises au Canada — Bandjoun, Bafoussam, Bangangté, Baham, Bafang, Dschang, Douala et bien d'autres — pour organiser leurs galas : invitations, billetterie et sponsoring.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://eventgalo.com/communaute-camerounaise" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://eventgalo.com/communaute-camerounaise",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-default.png"] },
};

const VILLAGES_CHEFFERIES = [
  "Bandjoun", "Bangangté", "Baham", "Bafang", "Bafou", "Bansoa", "Bangou", "Bameka",
  "Batcham", "Bapa", "Bayangam", "Batoufam", "Bamendjou", "Bamougoum", "Bandenkop",
  "Foréké-Dschang", "Fokoué", "Fongo-Tongo", "Foto", "Galim", "Malantouen",
];

const VILLES_CAMEROUN = [
  "Bafoussam", "Dschang", "Mbouda", "Douala", "Yaoundé", "Bafia", "Bamenda",
  "Buea", "Foumban", "Bertoua", "Garoua", "Maroua",
];

const VILLES_CANADA = [
  "Montréal", "Ottawa-Gatineau", "Toronto", "Calgary", "Edmonton", "Québec", "Sherbrooke",
];

export default function CameroonianCommunityPage() {
  return (
    <main className="container landing">
      <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 32px" }}>
        <span className="section-kicker">Communauté & diaspora</span>
        <h1 style={{ marginBottom: 12 }}>{TITLE}</h1>
        <p className="section-sub">
          Que vous organisiez le gala annuel de votre association villageoise, une soirée culturelle ou les
          retrouvailles de votre communauté, EventGalo s&apos;occupe des invitations, du RSVP, de la billetterie
          et de la recherche de sponsors — pour que vous puissiez vous concentrer sur l&apos;essentiel : vos
          invités.
        </p>
      </div>

      <div className="grid2" style={{ alignItems: "stretch" }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Vos origines, vos villages, vos chefferies</h2>
          <p className="muted">
            De nombreuses associations et « associations villageoises » camerounaises au Canada organisent leur
            gala annuel avec EventGalo — qu&apos;elles rassemblent la diaspora d&apos;un village bamiléké,
            d&apos;une ville ou d&apos;une région entière du Cameroun.
          </p>
          <div className="chip-row" style={{ marginTop: 12 }}>
            {VILLAGES_CHEFFERIES.map((v) => (
              <span key={v} className="chip">{v}</span>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            Et bien sûr les grandes villes : {VILLES_CAMEROUN.join(", ")}, et toutes les autres régions du
            Cameroun — Ouest, Littoral, Centre, Nord-Ouest, Sud-Ouest, Est, Nord et Extrême-Nord.
          </p>
        </div>
        <div className="portrait-frame" style={{ marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- image statique déjà servie par le hero carousel */}
          <img src="/hero/florist.jpg" alt="Décoration et prestataires vérifiés pour un gala de la diaspora" />
          <div className="portrait-caption">L&apos;héritage revisité</div>
        </div>
      </div>

      <section className="section" style={{ marginTop: 56 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span className="section-kicker">Ce qu&apos;EventGalo vous apporte</span>
          <h2 className="section-title" style={{ marginTop: 0 }}>Gestion premium pour événements d&apos;exception</h2>
        </div>
        <div className="grid3">
          <div className="card usecase">
            <div className="usecase-head">
              <div className="glass-icon">
                <Ticket />
              </div>
              <h3 style={{ margin: 0 }}>Billetterie sécurisée</h3>
            </div>
            <p className="muted">
              Catégories Standard, VIP, VIP+, paiement en ligne et QR codes infalsifiables pour l&apos;entrée le
              jour J.
            </p>
            <Link href="/connexion" className="feature-link">
              Découvrir <ArrowRight />
            </Link>
          </div>
          <div className="card usecase feature-accent">
            <div className="usecase-head">
              <div className="glass-icon feature-icon-accent">
                <PartyPopper />
              </div>
              <h3 style={{ margin: 0 }}>Invitations & RSVP</h3>
            </div>
            <p>
              Un lien personnalisé par invité, avec programme et confirmation en un clic — idéal pour les galas
              et soirées communautaires.
            </p>
            <Link href="/connexion" className="feature-link">
              En savoir plus <ArrowRight />
            </Link>
          </div>
          <div className="card usecase">
            <div className="usecase-head">
              <div className="glass-icon">
                <Handshake />
              </div>
              <h3 style={{ margin: 0 }}>Sponsoring & annuaire</h3>
            </div>
            <p className="muted">
              Trouvez des entreprises prêtes à sponsoriser votre gala, ou laissez-les découvrir votre événement
              dans l&apos;annuaire des opportunités.
            </p>
            <Link href="/sponsors" className="feature-link">
              Voir l&apos;annuaire <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <div className="card" style={{ marginTop: 24, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Partout où vit la diaspora camerounaise au Canada</h2>
          <p className="muted" style={{ margin: 0 }}>
            {VILLES_CANADA.join(", ")}… où que se trouve votre association, EventGalo fonctionne partout au
            Canada, avec paiement en ligne sécurisé via Stripe.
          </p>
        </div>
        <span className="chip" style={{ flex: "none" }}>
          <MapPin /> Canada d&apos;un océan à l&apos;autre
        </span>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", marginTop: 24 }}>
        <p className="muted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={18} /> Prêt à organiser le gala de votre association ?
        </p>
        <Link className="btn btn-gold" href="/connexion">
          Créer mon événement
        </Link>
      </div>
    </main>
  );
}
