import { X, ChevronLeft, ChevronRight, Heart, ShoppingCart } from 'lucide-react';
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

  useEffect(() => {
    if (isOpen && product) setCurrentIndex(0);
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
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, goPrev, goNext, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du produit"
    >
      <div
        className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Carte produit — style Clos de la Reine */}
      <div
        className="relative z-10 w-full max-w-4xl rounded-3xl overflow-hidden shadow-[var(--shadow)] animate-slideDown"
        style={{ background: 'var(--cream)', boxShadow: 'var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row md:min-h-0">
          {/* Gauche : image (mini carte) */}
          <div
            className="relative w-full md:w-[48%] md:min-h-[420px] flex flex-col"
            style={{ background: 'var(--cream)' }}
          >
            <div className="relative flex-1 flex items-center justify-center p-6 md:p-8 min-h-[280px] md:min-h-[340px]">
              {images[currentIndex] ? (
                <img
                  key={`${product.id}-${currentIndex}`}
                  src={images[currentIndex]}
                  alt={`${product.name} - Image ${currentIndex + 1}`}
                  className="max-w-full max-h-full w-auto h-auto object-contain select-none"
                  style={{ maxHeight: 'min(50vh, 380px)' }}
                  draggable={false}
                />
              ) : (
                <div className="w-full h-48 rounded-2xl flex items-center justify-center text-gray-500" style={{ background: 'var(--blush)' }}>
                  Image non disponible
                </div>
              )}

              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'var(--cream)', boxShadow: '0 2px 12px rgba(31,31,31,0.12)' }}
                    aria-label="Image précédente"
                  >
                    <ChevronLeft className="w-6 h-6 text-[var(--ink)]" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'var(--cream)', boxShadow: '0 2px 12px rgba(31,31,31,0.12)' }}
                    aria-label="Image suivante"
                  >
                    <ChevronRight className="w-6 h-6 text-[var(--ink)]" />
                  </button>
                </>
              )}
            </div>

            {/* Dots galerie */}
            {images.length > 0 && (
              <div className="flex justify-center gap-2 pb-5">
                {images.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setIndex(index)}
                    className={`h-2 rounded-full transition-all duration-200 ${
                      index === currentIndex ? 'w-6 bg-[var(--ink)]' : 'w-2 bg-[var(--ink)]/25 hover:bg-[var(--ink)]/40'
                    }`}
                    aria-label={`Image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Droite : infos */}
          <div className="w-full md:w-[52%] p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 rounded-full transition-colors hover:scale-105"
              style={{ background: 'var(--cream)', color: 'var(--ink)' }}
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 pr-10">
              <span
                className="inline-block text-xs font-medium uppercase tracking-[0.2em] px-3 py-1.5 rounded-full"
                style={{ background: 'var(--blush)', color: 'var(--ink)' }}
              >
                {product.collection}
              </span>
              <h2 className="text-2xl md:text-3xl font-light leading-tight" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--ink)' }}>
                {product.name}
              </h2>
              <p className="text-3xl font-light" style={{ color: 'var(--ink)' }}>
                {product.price.toFixed(0)} €
              </p>
              {product.briefDescription && (
                <p className="text-sm leading-relaxed opacity-85" style={{ color: 'var(--ink)' }}>
                  {product.briefDescription}
                </p>
              )}

              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70" style={{ color: 'var(--ink)' }}>
                  {Array.isArray(product.color) && product.color.length > 1 ? 'Couleurs' : 'Couleur'}
                </p>
                {Array.isArray(product.color) ? (
                  <div className="flex flex-wrap gap-2">
                    {product.color.map((c, i) => (
                      <span key={i} className="px-3 py-1 rounded-full text-sm" style={{ background: 'var(--mint)', color: 'var(--ink)' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>{product.color}</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70" style={{ color: 'var(--ink)' }}>
                  Tailles
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <span
                      key={size}
                      className="px-3 py-1.5 rounded-full text-sm border"
                      style={{ borderColor: 'var(--ink)', color: 'var(--ink)', borderWidth: '1px' }}
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 space-y-3 border-t border-[var(--ink)]/10">
              <button
                type="button"
                onClick={() => { addToCart(product.id, 1); onClose(); }}
                className="w-full py-4 rounded-full font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'var(--ink)', color: 'var(--cream)' }}
              >
                <ShoppingCart className="w-5 h-5" />
                Ajouter au panier
              </button>
              <button
                type="button"
                onClick={handleFavoriteClick}
                className={`w-full py-4 rounded-full font-medium flex items-center justify-center gap-2 transition-all duration-300 border-2 ${
                  favorite ? 'border-red-400 text-red-600' : 'border-[var(--ink)]/20'
                }`}
                style={{ color: favorite ? undefined : 'var(--ink)', background: favorite ? 'rgb(254 226 226)' : 'transparent' }}
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
