import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: "Conditions générales d'utilisation d'EventGalo.",
};

export default function CguPage() {
  return (
    <main className="container narrow">
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="muted">Dernière mise à jour : 18 juillet 2026</p>

      <div className="alert info">
        Ce document est un modèle générique fourni à titre indicatif. Il ne constitue pas un avis juridique et
        devrait être validé par un professionnel du droit avant tout usage commercial impliquant de vrais
        paiements ou données personnelles à grande échelle.
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>1. Objet</h2>
        <p>
          EventGalo (« le Service ») est une application permettant de créer des fiches d&apos;événements,
          d&apos;envoyer des invitations personnalisées avec confirmation de présence (RSVP), de vendre des
          billets avec suivi par vendeur et validation à l&apos;entrée par QR code, de gérer le sponsoring
          d&apos;événements (paliers, engagements, vitrines des sponsors), et de mettre en relation organisateurs
          et entreprises via un annuaire de sponsors et une liste publique d&apos;événements à sponsoriser. En
          utilisant le Service, vous acceptez les présentes conditions.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>2. Accès au Service</h2>
        <p>
          L&apos;accès à l&apos;espace organisateur se fait sans mot de passe, via un lien de connexion à usage
          unique envoyé par courriel (« lien magique »), valide 15 minutes. Vous êtes responsable de la
          confidentialité de votre adresse courriel et de tout accès effectué depuis votre session.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>3. Responsabilités de l&apos;organisateur</h2>
        <p>En créant un événement, vous vous engagez à :</p>
        <ul>
          <li>fournir des informations exactes sur l&apos;événement (date, lieu, description, prix des billets) ;</li>
          <li>obtenir vous-même les autorisations nécessaires (droit des lieux, licences éventuelles, etc.) ;</li>
          <li>respecter les lois applicables, notamment en matière de protection des renseignements personnels
            de vos invités et acheteurs de billets ;</li>
          <li>définir et communiquer clairement votre politique de remboursement si vous vendez des billets.</li>
        </ul>
        <p>EventGalo agit comme fournisseur d&apos;outil et n&apos;est pas organisateur, partie prenante ou
          garant des événements créés par ses utilisateurs.</p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>4. Billetterie et paiements</h2>
        <p>
          Les paiements de billets sont traités par Stripe, un prestataire de paiement tiers. EventGalo ne stocke
          aucune donnée de carte bancaire. Les remboursements sont traités selon la politique définie par
          l&apos;organisateur de chaque événement, dans les limites permises par le Service.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          À la date de rédaction, les fonds des ventes de billets transitent par un compte Stripe unique de la
          plateforme ; les modalités de reversement aux organisateurs externes ne sont pas encore formalisées et
          feront l&apos;objet d&apos;une mise à jour de ce document.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>5. Sponsoring d&apos;événements</h2>
        <p>
          Les organisateurs peuvent définir des paliers de sponsoring (montant, nombre de places, avantages,
          niveau de visibilité) et inviter des entreprises à s&apos;engager ; les entreprises peuvent également se
          proposer d&apos;elles-mêmes sur un événement. Un engagement de sponsoring devient effectif lorsque
          l&apos;organisateur le confirme, ou automatiquement lors d&apos;un paiement en ligne réussi.
        </p>
        <ul>
          <li>Le contrat de sponsoring est conclu <strong>directement entre l&apos;entreprise et
            l&apos;organisateur</strong>. EventGalo fournit l&apos;outil de mise en relation, d&apos;engagement,
            de paiement et d&apos;affichage, mais n&apos;est pas partie à ce contrat et ne garantit ni
            l&apos;exécution des contreparties promises (avantages des paliers), ni la tenue de
            l&apos;événement, ni la solvabilité des parties.</li>
          <li>Les paiements de sponsoring effectués hors ligne (virement, facture) relèvent exclusivement des
            parties ; l&apos;organisateur confirme alors manuellement le sponsoring.</li>
          <li>Une entreprise peut décliner une proposition à tout moment avant confirmation ; un sponsoring
            confirmé ne peut être retiré que par entente avec l&apos;organisateur.</li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>6. Annuaire des sponsors et vitrines</h2>
        <ul>
          <li>L&apos;inscription d&apos;une entreprise à l&apos;annuaire public est <strong>volontaire</strong>
            (case à cocher explicite) et révocable à tout moment depuis l&apos;espace entreprise.</li>
          <li>Les contenus publiés dans un profil d&apos;entreprise ou une vitrine de sponsor (nom, description,
            coordonnées, liens, logo, photos, lien vidéo) sont fournis sous la seule responsabilité de leur
            auteur, qui garantit détenir les droits nécessaires (marques, droits d&apos;auteur, droit à
            l&apos;image) et l&apos;exactitude des informations.</li>
          <li>En publiant ces contenus, vous accordez à EventGalo une licence non exclusive et gratuite de les
            afficher dans le cadre du Service (annuaire, pages d&apos;événements, courriels liés).</li>
          <li>Les vidéos sont des intégrations YouTube ou Vimeo : leur lecture est régie par les conditions de
            ces plateformes ; EventGalo n&apos;héberge aucune vidéo.</li>
          <li>EventGalo peut retirer sans préavis tout contenu illicite, trompeur ou inapproprié, et
            l&apos;organisateur peut masquer tout contenu de la page de son événement.</li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>7. Contenu et usages interdits</h2>
        <p>Il est interdit d&apos;utiliser le Service pour :</p>
        <ul>
          <li>créer des événements ou des profils d&apos;entreprise frauduleux, illégaux ou trompeurs ;</li>
          <li>collecter des données personnelles sans consentement des personnes concernées ;</li>
          <li>tenter de contourner les mesures de sécurité (falsification de billets, accès non autorisé, etc.) ;</li>
          <li>envoyer des communications non sollicitées (pourriel) via les outils d&apos;invitation ou de mise
            en relation, y compris le démarchage abusif d&apos;entreprises via l&apos;annuaire ;</li>
          <li>publier des contenus portant atteinte aux droits de tiers (marques, droits d&apos;auteur, droit à
            l&apos;image).</li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>8. Disponibilité et limitation de responsabilité</h2>
        <p>
          Le Service est fourni « tel quel », sans garantie de disponibilité continue. EventGalo ne pourra être
          tenu responsable des pertes, dommages ou désagréments résultant d&apos;une interruption de service, d&apos;une
          erreur de saisie par l&apos;organisateur, ou de l&apos;annulation d&apos;un événement par son organisateur.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>9. Résiliation</h2>
        <p>
          Vous pouvez cesser d&apos;utiliser le Service à tout moment. EventGalo se réserve le droit de suspendre
          ou supprimer un compte en cas de violation des présentes conditions.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>10. Modifications</h2>
        <p>
          Ces conditions peuvent être mises à jour ; la date de dernière modification est indiquée en haut de
          cette page.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>11. Droit applicable</h2>
        <p>Les présentes conditions sont régies par les lois applicables au Québec, Canada.</p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>12. Contact</h2>
        <p>
          Pour toute question : <a href="mailto:billetterie@eventgalo.com">billetterie@eventgalo.com</a>
        </p>
      </div>
    </main>
  );
}
