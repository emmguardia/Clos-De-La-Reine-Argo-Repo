import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

export default function NotFoundPage() {
  return (
    <>
      <SEO title="Page introuvable" noindex path="/404" />
      <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="text-8xl font-light text-gray-200 select-none">404</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-light text-gray-900">Page introuvable</h1>
            <p className="text-gray-500 text-sm">
              La page que vous cherchez n&apos;existe pas ou a été déplacée.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-colors text-sm"
            >
              Retour à l&apos;accueil
            </Link>
            <Link
              to="/boutique"
              className="px-6 py-3 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors text-sm"
            >
              Voir la boutique
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
