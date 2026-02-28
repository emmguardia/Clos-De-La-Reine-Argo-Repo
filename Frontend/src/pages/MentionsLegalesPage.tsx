import { Link } from 'react-router-dom';

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors duration-200 text-sm">
            ← Retour à l&apos;accueil
          </Link>
        </div>
        <h1 className="text-3xl font-light text-gray-900 mb-8">Mentions Légales</h1>
        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">1. Éditeur du site</h2>
            <p>
              <strong>Le Clos de La Reine</strong><br />
              Auto-entrepreneur<br />
              1 Chemin de la Marnière, 77150 Lésigny<br />
              SIRET : 890 865 389 00021<br />
              Email : closdelareine@gmail.com<br />
              Téléphone : 06.28.46.26.44
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">2. Directeur de la publication</h2>
            <p>
              Le directeur de la publication est la personne physique ou morale qui dirige la rédaction du site. Pour Le Clos de La Reine, il s&apos;agit du titulaire de l&apos;auto-entreprise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">3. Hébergement</h2>
            <p>
              Le site leclosdelareine.com est hébergé par :<br /><br />
              <strong>Enzo Monnet-Mata (Zenixweb)</strong><br />
              Entrepreneur Individuel (Micro-Entrepreneur)<br />
              69830 Saint-Georges-de-Reneins, France<br />
              SIRET : 991 413 600<br />
              Contact : contact@zenixweb.fr<br />
              Site : www.zenixweb.fr
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">4. Propriété intellectuelle</h2>
            <p>
              L&apos;ensemble du contenu de ce site (textes, images, logos, graphismes, etc.) est protégé par le droit d&apos;auteur et le droit des marques. Toute reproduction ou utilisation non autorisée est interdite.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">5. Médiation de la consommation</h2>
            <p>
              Conformément à l&apos;article L.612-1 du Code de la consommation, en cas de litige, le client peut recourir gratuitement au médiateur de la consommation.
            </p>
            <p className="p-3 bg-gray-100 border border-gray-200 rounded-lg italic text-gray-600">
              Coordonnées du médiateur de la consommation : à compléter lors de l&apos;adhésion à un médiateur référencé (obligatoire pour tout vendeur à des particuliers).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">6. Droit applicable</h2>
            <p>
              Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux compétents seront ceux du ressort de Melun.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">7. Crédits</h2>
            <p>
              Site réalisé pour Le Clos de La Reine. Conception et développement : Zenixweb.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
