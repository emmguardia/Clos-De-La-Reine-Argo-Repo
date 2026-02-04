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
