import { Heart, ShoppingCart } from 'lucide-react';
import type { Product } from '../data/products';
import { useFavorites } from '../hooks/useFavorites';
import { useCart } from '../hooks/useCart';
import { trackEvent } from '../utils/analytics';
interface ProductCardProps {
  product: Product;
  showCollection?: boolean;
  compact?: boolean;
  readonlyMode?: boolean;
  onProductClick?: (product: Product) => void;
}
export default function ProductCard({ product, showCollection = true, compact = false, readonlyMode = false, onProductClick }: ProductCardProps) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addToCart } = useCart();
  const favorite = isFavorite(product.id);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorite) {
      removeFavorite(product.id);
      trackEvent('favorite_remove', { product_id: product.id, product_name: product.name, category: product.category });
    } else {
      addFavorite(product.id);
      trackEvent('favorite_add', { product_id: product.id, product_name: product.name, category: product.category });
    }
  };

  const needsSize = product.category === 'laisses' || product.category === 'colliers' || product.category === 'harnais';

  const isUnavailable = product.disponible === false;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnavailable) return;
    if (needsSize && onProductClick) {
      trackEvent('product_click_add_cart', { product_id: product.id, product_name: product.name, needs_size: true });
      onProductClick(product);
    } else {
      addToCart(product.id, 1);
      trackEvent('add_to_cart', { product_id: product.id, product_name: product.name, quantity: 1, source: 'product_card' });
    }
  };
  return (
    <div 
      className={`group bg-white rounded-3xl overflow-hidden shadow-sm shadow-black/5 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 animate-fadeIn cursor-pointer ${compact ? 'h-full' : ''}`}
      onClick={() => {
        if (onProductClick) {
          trackEvent('product_click', { product_id: product.id, product_name: product.name, category: product.category });
          onProductClick(product);
        }
      }}
    >
      <div className={`${compact ? 'h-52' : 'h-40 sm:h-56'} relative overflow-hidden`}>
        <img
          src={product.image}
          alt={`${product.name} — ${product.category} pour chien artisanal | Clos de la Reine`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10" />
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
            <span className="bg-white/95 text-gray-800 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              Non disponible
            </span>
          </div>
        )}
        <button
          onClick={handleFavoriteClick}
          className={`absolute top-4 right-4 p-2 rounded-full backdrop-blur-md transition-all duration-300 transform hover:scale-110 shadow-sm z-10 ${
            favorite ? 'bg-red-500 text-white' : 'bg-white/85 text-gray-700 hover:text-red-500'
          }`}
        >
          <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />
        </button>
      </div>
      <div className="p-4 sm:p-6 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
          <h3 className="text-base sm:text-lg font-light text-gray-900 group-hover:text-gray-600 transition-colors duration-200">
            {product.name}
          </h3>
          {showCollection && (
            <span className="self-start sm:self-auto text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#f2dedd] text-gray-900 whitespace-nowrap">
              {product.collection}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-gray-500">
          Couleur {Array.isArray(product.color)
            ? product.color.length <= 2
              ? product.color.join(' et ')
              : product.color.slice(0, -1).join(', ') + ' et ' + product.color[product.color.length - 1]
            : product.color} · Tailles {product.sizes.length > 1
            ? (product.category === 'laisses' ? `${product.sizes[0]} et ${product.sizes[1]}` : `du ${product.sizes[0]} au ${product.sizes[product.sizes.length - 1]}`)
            : product.sizes[0]}
        </p>
        <div className="flex items-center justify-between pt-2">
          <span className="text-xl sm:text-2xl font-light text-gray-900">{product.price.toFixed(0)}€</span>
          {!readonlyMode && (
            isUnavailable ? (
              <span className="text-xs text-red-500 font-medium">Non disponible</span>
            ) : (
              <button
                onClick={handleAddToCart}
                className="bg-gray-900 text-white p-2 sm:p-3 rounded-full hover:bg-gray-800 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
              >
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
