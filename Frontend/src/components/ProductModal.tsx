import { X, ChevronLeft, ChevronRight, Heart, ShoppingCart, ChevronDown } from 'lucide-react';
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

function ProductModalBody({
  product,
  images,
  onClose,
  favorite,
  onFavoriteClick,
  addToCart
}: {
  product: Product;
  images: string[];
  onClose: () => void;
  favorite: boolean;
  onFavoriteClick: () => void;
  addToCart: (id: number, qty: number) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const hasMultipleImages = images.length > 1;
  const [guideOpen, setGuideOpen] = useState(false);
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

      {/* Carte produit — même taille d’image que l’autre Clos de la Reine (60vh / 80vh) */}
      <div
        className="relative z-10 w-full max-w-6xl rounded-3xl overflow-hidden bg-white shadow-[var(--shadow)] animate-slideDown max-h-[90vh]"
        style={{ boxShadow: 'var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row md:min-h-0 max-h-[90vh]">
          {/* Gauche : image en pleine hauteur comme l’autre projet */}
          <div className="relative w-full md:w-1/2 bg-gray-100 flex flex-col">
            <div className="relative h-[55vh] md:h-[80vh] overflow-hidden">
              {images[currentIndex] ? (
                <img
                  key={`${product.id}-${currentIndex}`}
                  src={images[currentIndex]}
                  alt={`${product.name} - Image ${currentIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-500">
                  Image non disponible
                </div>
              )}
              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg flex items-center justify-center transition-all hover:scale-105 z-10"
                    aria-label="Image précédente"
                  >
                    <ChevronLeft className="w-6 h-6 text-gray-800" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg flex items-center justify-center transition-all hover:scale-105 z-10"
                    aria-label="Image suivante"
                  >
                    <ChevronRight className="w-6 h-6 text-gray-800" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setIndex(index)}
                        className={`h-2 rounded-full transition-all duration-200 ${
                          index === currentIndex ? 'w-8 bg-gray-900' : 'w-2 bg-white/70 hover:bg-white'
                        }`}
                        aria-label={`Image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Droite : infos */}
          <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col justify-between overflow-y-auto bg-white max-h-[90vh]">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-colors hover:scale-105 text-gray-800"
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
                {product.category === 'harnais' && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setGuideOpen((o) => !o)}
                      className="text-xs font-medium cursor-pointer flex items-center gap-1.5 opacity-80 hover:opacity-100 w-full text-left"
                      style={{ color: 'var(--ink)' }}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${guideOpen ? 'rotate-180' : '-rotate-90'}`} />
                      Guide des tailles (exemples de races)
                    </button>
                    {guideOpen && (
                      <div className="mt-2 pl-4 text-xs leading-relaxed border-l-2 space-y-1.5 py-2" style={{ borderColor: 'var(--blush)', color: 'var(--ink)' }}>
                        <p><strong>XS</strong> · Chihuahua, Yorkshire Terrier, Spitz nain (Poméranien)</p>
                        <p><strong>S</strong> · Teckel, Jack Russell Terrier, Carlin</p>
                        <p><strong>M</strong> · Cocker Anglais, Beagle, Bouledogue Français</p>
                        <p><strong>L</strong> · Golden Retriever, Labrador, Berger Australien</p>
                        <p><strong>XL</strong> · Léonberg, Terre-Neuve, Saint-Bernard</p>
                        <p className="mt-2 opacity-80 italic">Indicatif. Pour un choix parfait, privilégiez les mesures du chien (tour de cou, tour de poitrail).</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-6 space-y-3 border-t border-gray-200">
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
                onClick={onFavoriteClick}
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

export default function ProductModal({ product, isOpen, onClose }: ProductModalProps) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addToCart } = useCart();
  const images = useMemo(() => getImages(product), [product]);
  const favorite = product ? isFavorite(product.id) : false;
  const handleFavoriteClick = async () => {
    if (!product) return;
    if (favorite) await removeFavorite(product.id);
    else await addFavorite(product.id);
  };
  if (!isOpen || !product) return null;
  return (
    <ProductModalBody
      key={product.id}
      product={product}
      images={images}
      onClose={onClose}
      favorite={favorite}
      onFavoriteClick={handleFavoriteClick}
      addToCart={addToCart}
    />
  );
}
