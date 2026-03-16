import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { useProductsByIds } from '../hooks/useProductsByIds';
import { useFavorites } from '../hooks/useFavorites';
import { fetchProductsPaginated } from '../data/products';
import type { Product } from '../data/products';

export default function FavoritesPage() {
  const { favorites, loading: favoritesLoading } = useFavorites();
  const { products: favoriteProducts, loading: productsLoading } = useProductsByIds(favorites);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  useEffect(() => {
    if (favorites.length > 0) {
      fetchProductsPaginated({ limit: 10 }).then(({ products }) => {
        setSuggestions(products.filter(p => !favorites.includes(p.id)).slice(0, 3));
      }).catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
  }, [favorites]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="space-y-3 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#f2dedd] text-2xl">💛</div>
          <h1 className="text-3xl sm:text-4xl font-light text-gray-900">Vos favoris</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Sauvegardez colliers, laisses et harnais pour les retrouver en un clic. Ajoutez depuis les pages boutique.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              to="/boutique?category=colliers"
              className="px-5 py-3 rounded-full bg-gray-900 text-white text-sm hover:bg-gray-800 transition-colors"
            >
              Voir les colliers
            </Link>
            <Link
              to="/boutique?category=laisses"
              className="px-5 py-3 rounded-full bg-white text-gray-900 border border-black/10 text-sm hover:border-gray-900 transition-colors"
            >
              Voir les laisses
            </Link>
            <Link
              to="/boutique?category=harnais"
              className="px-5 py-3 rounded-full bg-white text-gray-900 border border-black/10 text-sm hover:border-gray-900 transition-colors"
            >
              Voir les harnais
            </Link>
          </div>
        </div>
        {productsLoading || favoritesLoading ? (
          <div className="rounded-[28px] border border-black/5 bg-white/80 backdrop-blur-sm p-10 text-center shadow-sm">
            <p className="text-lg text-gray-700">Chargement des favoris...</p>
          </div>
        ) : favoriteProducts.length === 0 ? (
          <div className="rounded-[28px] border border-black/5 bg-white/80 backdrop-blur-sm p-10 text-center shadow-sm">
            <p className="text-lg text-gray-700">Aucun favori pour l'instant.</p>
            <p className="text-sm text-gray-500 mt-2">Cliquez sur le cœur sur un produit pour l'ajouter à vos favoris.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light text-gray-900">
                {favoriteProducts.length} {favoriteProducts.length === 1 ? 'favori' : 'favoris'}
              </h2>
              <div className="h-px w-16 bg-gray-900" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteProducts.map((product) => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  onProductClick={(product) => {
                    setSelectedProduct(product);
                    setIsModalOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {favoriteProducts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light text-gray-900">Découvrir aussi</h2>
              <div className="h-px w-16 bg-gray-900" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {suggestions.map((product) => (
                  <ProductCard 
                    key={product.id} 
                    product={product} 
                    onProductClick={(product) => {
                      setSelectedProduct(product);
                      setIsModalOpen(true);
                    }}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
      <ProductModal 
        product={selectedProduct} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
