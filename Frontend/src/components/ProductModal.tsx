import { X, ChevronLeft, ChevronRight, Heart, ShoppingCart, ChevronDown, Check, Scissors, Lock, Truck } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import type { Product } from '../data/products';
import { fetchProductById } from '../data/products';
import { useFavorites } from '../hooks/useFavorites';
import { useCart } from '../hooks/useCart';
import { trackEvent } from '../utils/analytics';

const BASE_URL = 'https://leclosdelareine.com';

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
  addToCart: (id: number, qty: number, size?: string, productName?: string) => void;
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

  // Schema.org Product JSON-LD — injecté dans <head> pendant l'ouverture du modal
  const productJsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.briefDescription ? { description: product.briefDescription } : {}),
    image: images.map((img) => img.startsWith('http') ? img : `${BASE_URL}${img}`),
    brand: { '@type': 'Brand', name: 'Clos de la Reine' },
    category: product.category,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: product.price.toFixed(2),
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/boutique`,
      priceValidUntil: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().split('T')[0],
      seller: { '@type': 'Organization', name: 'Clos de la Reine' },
    },
  }), [product, images]);

  const [guideOpen, setGuideOpen] = useState(true);
  const needsSizeSelection = product.category === 'laisses' || product.category === 'colliers' || product.category === 'harnais';
  const laisseSizes = ['1m', '1m20'];
  const collarHarnessSizes = ['XS', 'S', 'M', 'L', 'XL'];
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [sizeMissing, setSizeMissing] = useState(false);
  const sizeSelectRef = useRef<HTMLSelectElement>(null);
  const isUnavailable = product.disponible === false;
  const [adding, setAdding] = useState(false);
  const handleAddToCart = async () => {
    if (isUnavailable) return;
    if (needsSizeSelection && !selectedSize) {
      // Bouton toujours actif : on montre plutôt où choisir la taille
      setSizeMissing(true);
      sizeSelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sizeSelectRef.current?.focus();
      return;
    }
    setAdding(true);
    await addToCart(product.id, 1, needsSizeSelection ? selectedSize : undefined, product.name);
    trackEvent('add_to_cart', {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      size: needsSizeSelection ? selectedSize : undefined,
      source: 'product_modal',
    });
    await new Promise((r) => setTimeout(r, 300));
    onClose();
  };
  return (
    <>
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(productJsonLd)}</script>
    </Helmet>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du produit"
    >
      <div
        className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Carte produit — plein écran sur téléphone (bouton panier toujours visible), 80vh sur ordinateur */}
      <div
        className="product-modal-card relative z-10 w-full max-w-6xl md:rounded-3xl overflow-hidden bg-white animate-slideDown"
        style={{ boxShadow: 'var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row h-full md:h-auto min-h-0 md:items-start">
          {/* Gauche : image — mobile h-[35%] du full-screen, desktop 80vh */}
          <div className="product-modal-image relative w-full md:w-1/2 bg-gray-100">
            <div className="relative w-full h-full overflow-hidden">
              {images[currentIndex] ? (
                <>
                  {/* Téléphone : photo entière, fond = même photo floutée */}
                  <img
                    key={`${product.id}-${currentIndex}-fond`}
                    src={images[currentIndex]}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full scale-110 object-cover blur-2xl brightness-90 md:hidden"
                    draggable={false}
                  />
                  <img
                    key={`${product.id}-${currentIndex}`}
                    loading="lazy"
                    src={images[currentIndex]}
                    alt={`${product.name} - Image ${currentIndex + 1}`}
                    className="absolute inset-0 w-full h-full object-contain md:object-cover animate-imageFade"
                    draggable={false}
                  />
                </>
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

          {/* Droite : infos — mobile flex-1 (65% restant), desktop 80vh */}
          <div className="product-modal-text w-full md:w-1/2 p-4 md:p-10 flex flex-col bg-white min-h-0">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-colors hover:scale-105 text-gray-800"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2">
            <div className="space-y-2 md:space-y-4 pr-8">
              <span
                className="inline-block text-xs font-medium uppercase tracking-[0.2em] px-3 py-1 md:py-1.5 rounded-full"
                style={{ background: 'var(--blush)', color: 'var(--ink)' }}
              >
                {product.collection}
              </span>
              <h2 className="text-xl md:text-3xl font-light leading-tight" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--ink)' }}>
                {product.name}
              </h2>
              <p className="text-2xl md:text-3xl font-light" style={{ color: 'var(--ink)' }}>
                {product.price.toFixed(0)} €
              </p>
              {product.briefDescription && (
                <p className="text-sm leading-relaxed opacity-85 line-clamp-2 md:line-clamp-none" style={{ color: 'var(--ink)' }}>
                  {product.briefDescription}
                </p>
              )}

              <div className="space-y-2 md:space-y-3 pt-1 md:pt-2">
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

              <div className="space-y-1.5 md:space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70" style={{ color: 'var(--ink)' }}>
                  {product.category === 'laisses' ? 'Longueur' : 'Tailles'}
                </p>
                {needsSizeSelection ? (
                  <>
                    <p className="text-sm opacity-90" style={{ color: 'var(--ink)' }}>
                      {product.category === 'laisses' ? '1 m ou 1,20 m' : 'XS à XL'}
                    </p>
                    <select
                      ref={sizeSelectRef}
                      value={selectedSize}
                      onChange={(e) => { setSelectedSize(e.target.value); setSizeMissing(false); }}
                      aria-invalid={sizeMissing}
                      className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                      style={{ borderColor: sizeMissing ? '#dc2626' : 'var(--ink)', color: 'var(--ink)' }}
                    >
                      <option value="">Choisir ma taille</option>
                      {(product.category === 'laisses' ? laisseSizes : collarHarnessSizes).map((size) => (
                        <option key={size} value={size}>
                          {size === '1m20' ? '1,20 m' : size}
                        </option>
                      ))}
                    </select>
                    {sizeMissing && (
                      <p className="text-xs text-red-600" role="alert">Choisissez une taille pour l'ajouter au panier.</p>
                    )}
                  </>
                ) : (
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
                )}
                {(product.category === 'harnais' || product.category === 'colliers') && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                      setGuideOpen((o) => {
                        if (!o) trackEvent('size_guide_open', { product_id: product.id, category: product.category });
                        return !o;
                      });
                    }}
                      className="text-xs font-medium cursor-pointer flex items-center gap-1.5 opacity-80 hover:opacity-100 w-full text-left transition-opacity duration-200"
                      style={{ color: 'var(--ink)' }}
                    >
                      {guideOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform duration-300 ease-out" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-300 ease-out" />
                      )}
                      Guide des tailles (exemples de races)
                    </button>
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-out"
                      style={{ gridTemplateRows: guideOpen ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden min-h-0">
                        <div className="mt-2 pl-4 text-xs leading-relaxed border-l-2 space-y-1.5 py-2 transition-opacity duration-300 max-h-32 overflow-y-auto" style={{ borderColor: 'var(--blush)', color: 'var(--ink)', opacity: guideOpen ? 1 : 0 }}>
                          <p><strong>XS</strong> · Chihuahua, Yorkshire Terrier, Spitz nain (Poméranien)</p>
                          <p><strong>S</strong> · Teckel, Jack Russell Terrier, Carlin</p>
                          <p><strong>M</strong> · Cocker Anglais, Beagle, Bouledogue Français</p>
                          <p><strong>L</strong> · Golden Retriever, Labrador, Berger Australien</p>
                          <p><strong>XL</strong> · Léonberg, Terre-Neuve, Saint-Bernard</p>
                          <p className="mt-2 opacity-80 italic">Indicatif. Pour un choix parfait, privilégiez les mesures du chien (tour de cou, tour de poitrail).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>

            <div className="product-modal-actions flex-shrink-0 mt-2 md:mt-4 pt-3 md:pt-4 border-t border-gray-200">
              <div className="flex gap-2 md:flex-col md:gap-3">
                {isUnavailable ? (
                  <div className="flex-1 md:w-full py-3 md:py-4 rounded-full font-medium flex items-center justify-center gap-2 bg-gray-100 text-gray-400 cursor-not-allowed select-none">
                    <ShoppingCart className="w-5 h-5" />
                    Non disponible
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={adding}
                  className={`flex-1 md:w-full py-3 md:py-4 rounded-full font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed ${adding ? 'scale-95' : ''}`}
                  style={{ background: 'var(--ink)', color: 'var(--cream)' }}
                >
                  {adding ? (
                    <Check className="w-5 h-5 text-green-300" />
                  ) : (
                    <ShoppingCart className="w-5 h-5" />
                  )}
                  {adding ? 'Ajouté !' : `Ajouter au panier · ${product.price.toFixed(0)} €`}
                </button>
                )}
                <button
                  type="button"
                  onClick={onFavoriteClick}
                  aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  className={`w-12 shrink-0 md:w-full py-3 md:py-4 rounded-full font-medium flex items-center justify-center gap-2 transition-all duration-300 border-2 ${
                    favorite ? 'border-red-400 text-red-600' : 'border-[var(--ink)]/20'
                  }`}
                  style={{ color: favorite ? undefined : 'var(--ink)', background: favorite ? 'rgb(254 226 226)' : 'transparent' }}
                >
                  <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} />
                  <span className="hidden md:inline">{favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span>
                </button>
              </div>
              {/* Réassurance juste sous le bouton panier */}
              <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] md:text-xs leading-tight text-gray-600 list-none">
                <li className="flex flex-col items-center gap-1"><Scissors className="w-4 h-4" aria-hidden />Fait main en France</li>
                <li className="flex flex-col items-center gap-1"><Lock className="w-4 h-4" aria-hidden />Paiement sécurisé</li>
                <li className="flex flex-col items-center gap-1"><Truck className="w-4 h-4" aria-hidden />Livré en 10 jours ouvrés en moyenne</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default function ProductModal({ product, isOpen, onClose }: ProductModalProps) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addToCart } = useCart();
  const [fullProduct, setFullProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!isOpen || !product) {
      queueMicrotask(() => setFullProduct(null));
      return;
    }
    queueMicrotask(() => setFullProduct(null));
    fetchProductById(product.id)
      .then((p) => setFullProduct(p ?? product))
      .catch(() => setFullProduct(product));
  }, [isOpen, product]);

  const displayProduct = fullProduct ?? product;
  const images = useMemo(() => getImages(displayProduct), [displayProduct]);
  const favorite = product ? isFavorite(product.id) : false;
  const handleFavoriteClick = async () => {
    if (!product) return;
    if (favorite) {
      await removeFavorite(product.id);
      trackEvent('favorite_remove', { product_id: product.id, product_name: product.name, source: 'modal' });
    } else {
      await addFavorite(product.id);
      trackEvent('favorite_add', { product_id: product.id, product_name: product.name, source: 'modal' });
    }
  };
  if (!isOpen || !product) return null;
  const productToShow = displayProduct ?? product;
  return (
    <ProductModalBody
      key={product.id}
      product={productToShow}
      images={images}
      onClose={onClose}
      favorite={favorite}
      onFavoriteClick={handleFavoriteClick}
      addToCart={addToCart}
    />
  );
}
