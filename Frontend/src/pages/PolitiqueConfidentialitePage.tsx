import { Link } from 'react-router-dom';

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors duration-200 text-sm">
            ← Retour à l&apos;accueil
          </Link>
        </div>
        <h1 className="text-3xl font-light text-gray-900 mb-8">Politique de Confidentialité</h1>
        <p className="text-gray-600 mb-8">
          Dernière mise à jour : février 2025. Cette politique est conforme au Règlement Général sur la Protection des Données (RGPD) et à la loi « Informatique et Libertés ».
        </p>
        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">1. Responsable du traitement</h2>
            <p>
              Le responsable du traitement des données personnelles est :<br /><br />
              <strong>Le Clos de La Reine</strong><br />
              1 Chemin de la Marnière, 77150 Lésigny<br />
              Email : closdelareine@gmail.com
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">2. Données collectées</h2>
            <p>
              Nous collectons uniquement les données nécessaires au fonctionnement de la boutique et à la relation commerciale :
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Identité et coordonnées :</strong> nom, prénom, email, adresse postale, numéro de téléphone (pour la commande et la livraison)</li>
              <li><strong>Données de commande :</strong> produits achetés, montants, historique des achats</li>
              <li><strong>Données de paiement :</strong> les paiements sont traités par Stripe ; nous ne stockons pas les numéros de carte bancaire</li>
              <li><strong>Données techniques :</strong> adresse IP, type de navigateur (pour la sécurité et le bon fonctionnement du site)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">3. Finalités du traitement</h2>
            <p>
              Vos données sont utilisées pour :
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Traiter et livrer vos commandes</li>
              <li>Vous contacter en cas de besoin (suivi de commande, réclamation)</li>
              <li>Gérer votre compte client et vos favoris</li>
              <li>Assurer la sécurité du site et prévenir les fraudes</li>
              <li>Respecter nos obligations légales (facturation, comptabilité)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">4. Base légale</h2>
            <p>
              Le traitement de vos données repose sur : l&apos;exécution du contrat (commande), notre intérêt légitime (sécurité, amélioration du service), et nos obligations légales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">5. Destinataires des données</h2>
            <p>
              Vos données ne sont jamais vendues. Elles peuvent être transmises à :
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Stripe</strong> : traitement des paiements (conforme PCI-DSS)</li>
              <li><strong>Transporteurs</strong> : pour la livraison de vos commandes</li>
              <li><strong>Hébergeur du site</strong> : pour le stockage technique des données</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">6. Durée de conservation</h2>
            <p>
              Vos données sont conservées pendant la durée nécessaire à nos obligations :
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Données de commande : 10 ans (obligation comptable)</li>
              <li>Données de compte : tant que le compte est actif, puis 3 ans après la dernière activité</li>
              <li>Données de contact (formulaire, email) : 3 ans après le dernier contact</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">7. Vos droits</h2>
            <p>
              Conformément au RGPD, vous disposez des droits suivants :
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données</li>
              <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
              <li><strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données</li>
              <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré</li>
              <li><strong>Droit d&apos;opposition</strong> : vous opposer à certains traitements</li>
            </ul>
            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à : <a href="mailto:closdelareine@gmail.com" className="text-gray-900 underline hover:no-underline">closdelareine@gmail.com</a>
            </p>
            <p>
              Vous pouvez également introduire une réclamation auprès de la CNIL : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-gray-900 underline hover:no-underline">www.cnil.fr</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">8. Cookies</h2>
            <p>
              Le site utilise des cookies strictement nécessaires au fonctionnement (session, panier, authentification). Aucun cookie publicitaire ou de tracking tiers n&apos;est utilisé sans votre consentement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">9. Sécurité</h2>
            <p>
              Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données : connexion HTTPS, mots de passe chiffrés, accès restreint aux données.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">10. Modifications</h2>
            <p>
              Cette politique peut être mise à jour. La date de dernière mise à jour est indiquée en tête de page. Nous vous invitons à la consulter régulièrement.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
