import { Link } from 'react-router-dom';

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors duration-200 text-sm">
            ← Retour à l'accueil
          </Link>
        </div>
        <h1 className="text-3xl font-light text-gray-900 mb-8">Politique de Confidentialité</h1>
        <div className="prose prose-gray max-w-none">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
            <p className="text-gray-700 font-light">
              Futurement ici la politique de confidentialité sera disponible. Cette page sera mise à jour dès que la politique de confidentialité sera rédigée.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
