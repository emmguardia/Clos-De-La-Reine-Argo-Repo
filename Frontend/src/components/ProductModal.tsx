import { X, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
    const extra = product.additionalImages.filter(valid).slice(0, Math.max(0, 10 - out.length));
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

  // Réinitialiser l'index à l'ouverture ou au changement de produit
  useEffect(() => {
    if (isOpen && product) {
      setCurrentIndex(0);
    }
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!product) return;
    setFavorite(isFavorite(product.id));
  }, [product, isFavorite]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  const setIndex = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, goPrev, goNext, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
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

  const hasMultipleImages = images.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du produit"
    >
      {/* Fond cliquable pour fermer */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      <div
        className="relative z-10 bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bouton fermer */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-[60] p-2.5 rounded-full bg-white/95 hover:bg-white border border-gray-200 shadow-md transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>

        <div className="grid md:grid-cols-2 gap-0 flex-1 min-h-0">
          {/* Colonne images */}
          <div className="relative flex flex-col min-h-[320px] md:min-h-0 bg-gray-50">
            {/* Image principale */}
            <div className="relative flex-1 flex items-center justify-center p-6 min-h-[280px] md:min-h-[360px]">
              {images[currentIndex] ? (
                <img
                  key={`${product.id}-${currentIndex}`}
                  src={images[currentIndex]}
                  alt={`${product.name} - Image ${currentIndex + 1} sur ${images.length}`}
                  className="max-w-full max-h-full w-auto h-auto object-contain select-none"
                  style={{ maxHeight: 'min(55vh, 420px)' }}
                  draggable={false}
                />
              ) : (
                <div className="w-full h-48 bg-gray-200 rounded-xl flex items-center justify-center text-gray-500">
                  Image non disponible
                </div>
              )}

              {/* Flèches prev/next sur l'image (si plusieurs images) */}
              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/95 hover:bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-800 transition-all hover:scale-105"
                    aria-label="Image précédente"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/95 hover:bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-800 transition-all hover:scale-105"
                    aria-label="Image suivante"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Galerie miniatures — toujours visible quand il y a au moins une image */}
            <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {images.map((img, index) => (
                  <button
                    type="button"
                    key={`thumb-${index}`}
                    onClick={() => setIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-900 ${
                      index === currentIndex
                        ? 'border-gray-900 ring-2 ring-gray-400 ring-offset-2 scale-105'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                    aria-label={`Voir image ${index + 1}`}
                    aria-current={index === currentIndex ? 'true' : undefined}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
              {hasMultipleImages && (
                <p className="text-center text-xs text-gray-500 mt-2">
                  Image {currentIndex + 1} / {images.length}
                </p>
              )}
            </div>
          </div>

          {/* Colonne infos */}
          <div className="p-6 md:p-8 overflow-y-auto flex flex-col">
            <div className="space-y-4">
              <span className="inline-block text-xs font-medium uppercase tracking-wider px-3 py-1 rounded-full bg-[#f2dedd] text-gray-800">
                {product.collection}
              </span>
              <h2 className="text-2xl md:text-3xl font-light text-gray-900">{product.name}</h2>
              <p className="text-3xl font-light text-gray-900">{product.price.toFixed(0)} €</p>
              {product.briefDescription && (
                <p className="text-gray-600 text-sm leading-relaxed">{product.briefDescription}</p>
              )}
            </div>

            <div className="space-y-4 mt-6">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  {Array.isArray(product.color) && product.color.length > 1 ? 'Couleurs' : 'Couleur'}
                </h3>
                {Array.isArray(product.color) ? (
                  <div className="flex flex-wrap gap-2">
                    {product.color.map((color, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 rounded-full bg-[#e5f2eb] text-sm text-gray-800"
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
                <div className="flex flex-wrap gap-2">
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

            <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
              <button
                type="button"
                onClick={() => {
                  addToCart(product.id, 1);
                  onClose();
                }}
                className="w-full bg-gray-900 text-white py-4 rounded-xl hover:bg-gray-800 transition-colors font-medium"
              >
                Ajouter au panier
              </button>
              <button
                type="button"
                onClick={handleFavoriteClick}
                className={`w-full border-2 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium ${
                  favorite
                    ? 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                    : 'border-gray-300 text-gray-800 hover:border-gray-900'
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
  );
}
