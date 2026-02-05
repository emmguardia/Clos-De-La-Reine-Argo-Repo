import { X, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Product } from '../data/products';
import { useFavorites } from '../hooks/useFavorites';
import { useCart } from '../hooks/useCart';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

function getImages(product: Product | null): string[] {
  if (!product) return [];
  const valid = (url: string) => typeof url === 'string' && url.trim().length > 0;
  const out: string[] = [];
  if (valid(product.image)) out.push(product.image);
  if (product.secondImage && valid(product.secondImage)) out.push(product.secondImage);
  if (product.additionalImages?.length) {
    const extra = product.additionalImages.filter(valid).slice(0, Math.max(0, 6 - out.length));
    out.push(...extra);
  }
  if (out.length === 0 && product.image) out.push(product.image);
  return out;
}

export default function ProductModal({ product, isOpen, onClose }: ProductModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addToCart } = useCart();
  const [favorite, setFavorite] = useState(false);

  const images = useMemo(() => getImages(product), [product]);

  const goPrev = () => {
    setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  };
  const goNext = () => {
    setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
  };

  useEffect(() => {
    if (!product) return;
    queueMicrotask(() => setCurrentIndex(0));
    const fav = isFavorite(product.id);
    queueMicrotask(() => setFavorite(fav));
  }, [product, isFavorite]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => (i <= 0 ? Math.max(0, images.length - 1) : i - 1));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, images.length]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleFavoriteClick = async () => {
    if (!product) return;
    if (favorite) {
      await removeFavorite(product.id);
      setFavorite(false);
    } else {
      await addFavorite(product.id);
      setFavorite(true);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du produit"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 bg-white rounded-3xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-[60] p-2 rounded-full bg-white/90 hover:bg-white border border-gray-200"
          aria-label="Fermer"
        >
          <X className="w-6 h-6 text-gray-900" />
        </button>

        <div className="grid md:grid-cols-2 gap-0">
          {/* Zone image : une seule visible (opacité), pas de scroll */}
          <div className="relative bg-gray-100 flex flex-col">
            <div className="relative w-full h-[50vh] md:h-[75vh] flex-shrink-0 overflow-hidden">
              {images.map((img, index) => (
                <div
                  key={index}
                  className="absolute inset-0 w-full h-full transition-opacity duration-300"
                  style={{
                    opacity: index === currentIndex ? 1 : 0,
                    pointerEvents: index === currentIndex ? 'auto' : 'none',
                  }}
                >
                  <img
                    src={img}
                    alt={`${product.name} - Image ${index + 1}`}
                    className="w-full h-full object-contain bg-gray-100"
                    draggable={false}
                  />
                </div>
              ))}
            </div>

            {/* Contrôles : flèches et miniatures */}
            {images.length > 1 && (
              <div className="flex items-center justify-between gap-3 p-3 border-t border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Image précédente"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-900" />
                </button>

                <div className="flex gap-2 flex-1 justify-center min-w-0 overflow-x-auto py-2">
                  {images.map((img, index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => setCurrentIndex(index)}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        index === currentIndex
                          ? 'border-gray-900 ring-2 ring-gray-400 ring-offset-1'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                      aria-label={`Voir image ${index + 1}`}
                      aria-current={index === currentIndex ? 'true' : undefined}
                    >
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={goNext}
                  className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Image suivante"
                >
                  <ChevronRight className="w-6 h-6 text-gray-900" />
                </button>
              </div>
            )}
          </div>

          <div className="p-8 md:p-12 overflow-y-auto max-h-[90vh]">
            <div className="space-y-6">
              <div>
                <span className="text-xs px-3 py-1 rounded-full bg-[#f2dedd] text-gray-900 inline-block mb-3">
                  {product.collection}
                </span>
                <h2 className="text-3xl font-light text-gray-900 mb-2">{product.name}</h2>
                <p className="text-4xl font-light text-gray-900 mb-3">{product.price.toFixed(0)}€</p>
                {product.briefDescription && (
                  <p className="text-gray-600 text-sm leading-relaxed">{product.briefDescription}</p>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    {Array.isArray(product.color) && product.color.length > 1 ? 'Couleurs' : 'Couleur'}
                  </h3>
                  {Array.isArray(product.color) ? (
                    <div className="flex flex-wrap gap-2">
                      {product.color.map((color, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full bg-[#e5f2eb] text-sm text-gray-900"
                        >
                          {color}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">{product.color}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Tailles disponibles</h3>
                  <div className="flex gap-2">
                    {product.sizes.map((size) => (
                      <span
                        key={size}
                        className="px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-700"
                      >
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    addToCart(product.id, 1);
                    onClose();
                  }}
                  className="w-full bg-gray-900 text-white py-4 rounded-full hover:bg-gray-800 transition-colors"
                >
                  Ajouter au panier
                </button>
                <button
                  type="button"
                  onClick={handleFavoriteClick}
                  className={`w-full border py-4 rounded-full transition-colors flex items-center justify-center gap-2 ${
                    favorite
                      ? 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-gray-300 text-gray-900 hover:border-gray-900'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />
                  {favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
