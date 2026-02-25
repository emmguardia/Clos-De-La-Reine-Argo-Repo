import { Link } from 'react-router-dom';
export default function Footer() {
  return (
    <footer className="bg-white/85 backdrop-blur-md border-t border-black/5 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <img src="/Images/Logo.png" alt="Logo" className="w-10 h-10" />
              <span className="text-xl font-light text-gray-900">Le Clos de la Reine</span>
            </div>
            <p className="text-gray-600 font-light text-sm">
              Maison française de colliers, laisses et harnais au élégants et intemporels.
            </p>
            <a
              href="https://www.instagram.com/le_clos_de_la_reine/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex mt-3 text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Instagram Le Clos de la Reine"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          </div>
          <div>
            <h4 className="font-light text-lg mb-4 text-gray-900">Boutique</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/boutique" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Tous les produits</Link></li>
              <li><Link to="/boutique?category=colliers" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Boutique</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-light text-lg mb-4 text-gray-900">Aide</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/contact" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Contact</Link></li>
              <li><Link to="/panier" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Panier</Link></li>
              <li><Link to="/faq" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">FAQ</Link></li>
              <li><Link to="/admin/login" className="text-gray-400 hover:text-gray-600 transition-colors duration-200 text-xs">Espace Admin</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-light text-lg mb-4 text-gray-900">Informations légales</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/cgv" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">CGV</Link></li>
              <li><Link to="/mentions-legales" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Mentions légales</Link></li>
              <li><Link to="/politique-confidentialite" className="text-gray-600 hover:text-gray-900 transition-colors duration-200">Politique de confidentialité</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-black/5 pt-8 text-center">
          <p className="text-gray-600 text-sm font-light">
            © 2026 Le Clos De La Reine. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
