import { X, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Product } from '../data/products';
import { useFavorites } from '../hooks/useFavorites';
import { useCart } from '../hooks/useCart';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductModal({ product, isOpen, onClose }: ProductModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addToCart } = useCart();
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    if (product) {
      queueMicrotask(() => {
        setCurrentImageIndex(0);
        setFavorite(isFavorite(product.id));
      });
    }
  }, [product, isFavorite]);

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
  if (!isOpen || !product) return null;
  const valid = (url: string) => typeof url === 'string' && url.trim().length > 0;
  const images: string[] = [];
  if (valid(product.image)) images.push(product.image);
  if (product.secondImage && valid(product.secondImage)) images.push(product.secondImage);
  if (product.additionalImages?.length) {
    const extra = product.additionalImages.filter(valid).slice(0, Math.max(0, 6 - images.length));
    images.push(...extra);
  }
  if (images.length === 0) images.push(product.image || '');
  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };
  const handlePrev = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    prevImage();
  };
  const handleNext = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    nextImage();
  };
  const handleDot = (index: number) => (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex(index);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du produit"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative z-10 bg-white rounded-3xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-[60] p-2 rounded-full bg-white/90 backdrop-blur-md hover:bg-white transition-all duration-200 transform hover:scale-110"
          aria-label="Fermer"
        >
          <X className="w-6 h-6 text-gray-900" />
        </button>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="relative bg-gray-100">
            <div className="relative h-[60vh] md:h-[80vh] overflow-hidden select-none">
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt={`${product.name} - Image ${index + 1}`}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                    index === currentImageIndex ? 'opacity-100 z-0' : 'opacity-0 z-0'
                  }`}
                  draggable={false}
                />
              ))}
            </div>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Image précédente"
                  onClick={handlePrev}
                  style={{ touchAction: 'manipulation' }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-[50] p-4 rounded-full bg-white/95 shadow-lg border border-gray-200 hover:bg-white hover:scale-105 transition-all duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-7 h-7 text-gray-900" />
                </button>
                <button
                  type="button"
                  aria-label="Image suivante"
                  onClick={handleNext}
                  style={{ touchAction: 'manipulation' }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-[50] p-4 rounded-full bg-white/95 shadow-lg border border-gray-200 hover:bg-white hover:scale-105 transition-all duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-7 h-7 text-gray-900" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[50] flex gap-2">
                  {images.map((_, index) => (
                    <button
                      type="button"
                      key={index}
                      aria-label={`Image ${index + 1}`}
                      onClick={handleDot(index)}
                      style={{ touchAction: 'manipulation' }}
                      className={`cursor-pointer rounded-full transition-all duration-200 flex-shrink-0 border-2 border-gray-300 hover:border-gray-900 ${
                        index === currentImageIndex ? 'bg-gray-900 w-8 h-2' : 'bg-white/90 w-2 h-2'
                      }`}
                    />
                  ))}
                </div>
              </>
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
                  onClick={() => {
                    if (product) {
                      addToCart(product.id, 1);
                      onClose();
                    }
                  }}
                  className="w-full bg-gray-900 text-white py-4 rounded-full hover:bg-gray-800 transition-all duration-300 transform hover:scale-105"
                >
                  Ajouter au panier
                </button>
                <button 
                  onClick={handleFavoriteClick}
                  className={`w-full border py-4 rounded-full transition-all duration-300 flex items-center justify-center gap-2 ${
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
