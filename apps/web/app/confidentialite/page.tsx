import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Comment EventGalo collecte, utilise et protège vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <main className="container narrow">
      <h1>Politique de confidentialité</h1>
      <p className="muted">Dernière mise à jour : 17 juillet 2026</p>

      <div className="alert info">
        Ce document est un modèle générique fourni à titre indicatif. Il ne constitue pas un avis juridique et
        devrait être validé par un professionnel du droit avant tout usage commercial impliquant de vraies
        données personnelles à grande échelle.
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>1. Qui sommes-nous</h2>
        <p>
          EventGalo (« nous ») exploite le service accessible à eventgalo.com, permettant de créer des
          événements, gérer des invitations avec confirmation de présence, et vendre des billets. Pour toute
          question relative à vos données personnelles :{" "}
          <a href="mailto:billetterie@eventgalo.com">billetterie@eventgalo.com</a>.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>2. Données que nous collectons</h2>
        <p>Selon votre usage du Service, nous collectons :</p>
        <ul>
          <li><strong>Organisateurs</strong> : adresse courriel (pour la connexion par lien magique).</li>
          <li><strong>Invités</strong> : nom, courriel et/ou téléphone (facultatifs), table assignée, nom d&apos;un
            parent/contact le cas échéant, statut de confirmation (RSVP) et toute réponse fournie à une question
            optionnelle posée par l&apos;organisateur (ex. allergies).</li>
          <li><strong>Acheteurs de billets</strong> : nom et courriel associés au billet. Les données de paiement
            (numéro de carte, etc.) sont saisies directement chez Stripe et ne transitent jamais par nos
            serveurs.</li>
          <li><strong>Photos</strong> : les invités peuvent partager des photos liées à un événement, visibles
            par les autres invités de ce même événement.</li>
          <li><strong>Données techniques</strong> : horodatage d&apos;ouverture d&apos;un lien d&apos;invitation, à
            des fins de suivi par l&apos;organisateur.</li>
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>3. Pourquoi nous les utilisons</h2>
        <ul>
          <li>Permettre à l&apos;organisateur de créer et gérer son événement ;</li>
          <li>Envoyer les invitations et billets, et permettre la confirmation de présence ;</li>
          <li>Valider les billets à l&apos;entrée par lecture du QR code ;</li>
          <li>Traiter les paiements et remboursements de billetterie (via Stripe) ;</li>
          <li>Vous authentifier via le lien de connexion envoyé par courriel.</li>
        </ul>
        <p>
          La base légale de ce traitement est votre <strong>consentement</strong>, recueilli explicitement au
          moment de la confirmation de présence ou de l&apos;achat d&apos;un billet.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>4. Durée de conservation</h2>
        <p>
          Les données d&apos;un événement (invités, billets, transactions, photos) sont <strong>automatiquement
          supprimées ou anonymisées 30 jours après la date de l&apos;événement</strong>. Ce nettoyage est effectué
          par une tâche automatisée quotidienne, sans intervention manuelle nécessaire.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>5. Partage avec des tiers</h2>
        <p>Nous faisons appel aux sous-traitants suivants pour opérer le Service :</p>
        <ul>
          <li><strong>Stripe</strong> (traitement des paiements par carte) ;</li>
          <li><strong>Cloudflare</strong> (hébergement de l&apos;application, base de données, stockage des
            photos, envoi des courriels transactionnels).</li>
        </ul>
        <p>Nous ne vendons ni ne louons vos données personnelles à des tiers à des fins publicitaires.</p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>6. Témoins (cookies) et stockage local</h2>
        <p>
          Le Service utilise le stockage local de votre navigateur uniquement pour conserver votre session de
          connexion (organisateur). Aucun témoin de suivi publicitaire ou d&apos;analyse comportementale
          n&apos;est utilisé actuellement.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>7. Vos droits</h2>
        <p>Conformément aux lois applicables en matière de protection des renseignements personnels (notamment
          la Loi 25 au Québec), vous pouvez en tout temps :</p>
        <ul>
          <li>demander l&apos;accès aux données que nous détenons à votre sujet ;</li>
          <li>demander la correction de données inexactes ;</li>
          <li>demander la suppression anticipée de vos données (avant le délai automatique de 30 jours) ;</li>
          <li>retirer votre consentement, notamment en déclinant une invitation ou en contactant
            l&apos;organisateur de l&apos;événement.</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez-nous à <a href="mailto:billetterie@eventgalo.com">billetterie@eventgalo.com</a>{" "}
          ou adressez-vous directement à l&apos;organisateur de l&apos;événement concerné. Vous pouvez également
          porter plainte auprès de la Commission d&apos;accès à l&apos;information du Québec.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>8. Sécurité</h2>
        <p>
          Les communications avec le Service sont chiffrées (HTTPS). Les billets sont signés numériquement pour
          empêcher toute falsification, et chaque billet ne peut être validé qu&apos;une seule fois à
          l&apos;entrée.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>9. Modifications</h2>
        <p>
          Cette politique peut être mise à jour ; la date de dernière modification est indiquée en haut de cette
          page.
        </p>
      </div>
    </main>
  );
}
