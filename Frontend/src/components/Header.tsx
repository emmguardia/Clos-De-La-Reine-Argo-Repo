import { ShoppingCart, Heart, User, Menu, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';

interface UserData {
  firstName: string;
  lastName: string;
  email?: string;
}

export default function Header() {
  const { items: cartItems, refreshCart } = useCart();
  const { favorites, refreshFavorites } = useFavorites();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      const parsed = JSON.parse(userStr);
      if (parsed && typeof parsed === 'object' && parsed.firstName && parsed.lastName) {
        return {
          firstName: String(parsed.firstName).slice(0, 50),
          lastName: String(parsed.lastName).slice(0, 50),
          email: parsed.email ? String(parsed.email).slice(0, 255) : undefined
        };
      }
    } catch {
      localStorage.removeItem('user');
    }
    return null;
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCartUpdate = () => {
      refreshCart();
    };
    const handleFavoritesUpdate = () => {
      refreshFavorites();
    };
    window.addEventListener('cartUpdated', handleCartUpdate);
    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);
    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
    };
  }, [refreshCart, refreshFavorites]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const favoritesCount = favorites.length;

  useEffect(() => {
    const handleStorageChange = () => {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const parsed = JSON.parse(userStr);
          if (parsed && typeof parsed === 'object' && parsed.firstName && parsed.lastName) {
            setUser({
              firstName: String(parsed.firstName).slice(0, 50),
              lastName: String(parsed.lastName).slice(0, 50),
              email: parsed.email ? String(parsed.email).slice(0, 255) : undefined
            });
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
          localStorage.removeItem('user');
        }
      } else {
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);
  return (
    <header className="sticky top-0 bg-white/85 backdrop-blur-md z-50 border-b border-black/5 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group cursor-pointer">
            <img src="/Images/Logo.png" alt="Logo" className="w-10 h-10" />
            <span className="text-xl font-light tracking-wide">Le Clos De La Reine</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 relative group">
              Accueil
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gray-900 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/boutique" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 relative group">
              Boutique
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gray-900 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/contact" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 relative group">
              Contact
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gray-900 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/faq" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 relative group">
              FAQ
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gray-900 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link to="/galerie" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 relative group">
              Galerie
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gray-900 group-hover:w-full transition-all duration-300"></span>
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link to="/favoris" className="relative p-2 hover:bg-gray-50 rounded-full transition-all duration-200 transform hover:scale-110">
              <Heart className="w-5 h-5 text-gray-600" />
              {favoritesCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {favoritesCount}
                </span>
              )}
            </Link>
            {user ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-50 rounded-2xl transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#f2dedd] to-[#e5f2eb] flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {user.firstName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="hidden md:block text-sm text-gray-700 font-light">
                    Bonjour {user.firstName.slice(0, 20)}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-slideDown">
                    <Link
                      to="/profil"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                      <div className="font-medium">Mon profil</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{user.email?.slice(0, 30) || ''}</div>
                    </Link>
                    <div className="border-t border-gray-100 my-2"></div>
                    <button
                      onClick={() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        setIsProfileMenuOpen(false);
                        window.location.reload();
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/connexion" className="p-2 hover:bg-gray-50 rounded-full transition-all duration-200 transform hover:scale-110">
                <User className="w-5 h-5 text-gray-600" />
              </Link>
            )}
            <Link to="/panier" className="relative p-2 hover:bg-gray-50 rounded-full transition-all duration-200 transform hover:scale-110">
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              className="md:hidden p-2 hover:bg-gray-50 rounded-full transition-all duration-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="md:hidden py-4 animate-slideDown">
            <nav className="flex flex-col space-y-3">
              <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 py-2">Accueil</Link>
              <Link to="/boutique" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 py-2">Boutique</Link>
              <Link to="/contact" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 py-2">Contact</Link>
              <Link to="/faq" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 py-2">FAQ</Link>
              <Link to="/galerie" className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 py-2">Galerie</Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
