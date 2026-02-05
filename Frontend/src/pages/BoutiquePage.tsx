import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import { useProducts } from '../hooks/useProducts';
import type { Product, ProductCategory } from '../data/products';
export default function BoutiquePage() {
  const { products, loading } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') as ProductCategory | null;
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>(
    categoryParam && ['colliers', 'harnais', 'laisses'].includes(categoryParam) ? categoryParam : 'all'
  );
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const categoryProducts = useMemo(
    () => selectedCategory === 'all' 
      ? products 
      : products.filter((p) => p.category === selectedCategory),
    [selectedCategory, products]
  );
  const filtered = useMemo(
    () => categoryProducts.filter(
      (p) => (selectedCollection === 'all' || p.collection === selectedCollection) &&
             (selectedColor === 'all' || 
              (Array.isArray(p.color) ? p.color.includes(selectedColor) : p.color === selectedColor))
    ),
    [categoryProducts, selectedCollection, selectedColor]
  );
  const collections = useMemo(
    () => Array.from(new Set(categoryProducts.map((p) => p.collection))),
    [categoryProducts]
  );
  const colors = useMemo(
    () => {
      const allColors = categoryProducts.flatMap((p) => 
        Array.isArray(p.color) ? p.color : [p.color]
      );
      return Array.from(new Set(allColors));
    },
    [categoryProducts]
  );
  useEffect(() => {
    if (categoryParam && ['colliers', 'harnais', 'laisses'].includes(categoryParam)) {
      queueMicrotask(() => setSelectedCategory(categoryParam));
    }
  }, [categoryParam]);
  const categories: { value: ProductCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'Tous les produits' },
    { value: 'colliers', label: 'Colliers' },
    { value: 'harnais', label: 'Harnais' },
    { value: 'laisses', label: 'Laisses' },
  ];
  const handleCategoryChange = (category: ProductCategory | 'all') => {
    setSelectedCategory(category);
    setSelectedCollection('all');
    setSelectedColor('all');
    if (category === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ category });
    }
  };
  return (
    <div className="bg-white min-h-screen">
      <div className="relative border-b border-black/5">
        <div className="absolute inset-0">
          <img
            src="/Images/header2.jpg"
            alt="Notre boutique"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18 grid grid-cols-[1fr_minmax(200px,260px)] gap-6 items-start">
          <div className="space-y-4">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Boutique</p>
            <h1 className="text-4xl sm:text-5xl font-light text-gray-900 leading-tight">Notre boutique</h1>
            <p className="text-gray-700 max-w-3xl">
              Découvrez notre sélection de colliers, harnais et laisses. <br /> Matières premium, finitions sellier, élégance épurée.
            </p>
          </div>
          <aside className="bg-white/80 border border-black/5 rounded-3xl p-6 shadow-sm space-y-3">
            <h2 className="text-sm text-gray-600 font-medium">Catégories</h2>
            <nav className="flex flex-wrap gap-2" aria-label="Filtres par catégorie">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => handleCategoryChange(cat.value as ProductCategory | 'all')}
                  className={`px-3 py-2 rounded-full text-sm transition-colors ${
                    selectedCategory === cat.value 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-[#f2dedd] text-gray-800 hover:bg-[#e8d0cf]'
                  }`}
                  aria-pressed={selectedCategory === cat.value}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
            <h2 className="text-sm text-gray-600 font-medium pt-2">Collections</h2>
            <nav className="flex flex-wrap gap-2" aria-label="Filtres par collection">
              {collections.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setSelectedCollection(col)}
                  className={`px-3 py-2 rounded-full text-sm transition-colors ${
                    selectedCollection === col 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-[#f8f4ef] text-gray-800 hover:bg-[#f0e8df]'
                  }`}
                  aria-pressed={selectedCollection === col}
                >
                  {col}
                </button>
              ))}
            </nav>
            <h2 className="text-sm text-gray-600 font-medium pt-2">Couleurs</h2>
            <nav className="flex flex-wrap gap-2" aria-label="Filtres par couleur">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`px-3 py-2 rounded-full text-sm transition-colors ${
                    selectedColor === color 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-[#e5f2eb] text-gray-800 hover:bg-[#d4e8dc]'
                  }`}
                  aria-pressed={selectedColor === color}
                >
                  {color}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => {
                handleCategoryChange('all');
                setSelectedCollection('all');
                setSelectedColor('all');
              }}
              className="mt-4 w-full px-3 py-2 rounded-full bg-gray-200 text-gray-800 text-sm hover:bg-gray-300 transition-colors"
            >
              Réinitialiser
            </button>
          </aside>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
        {loading ? (
          <div className="text-center py-16" role="status" aria-live="polite">
            <p className="text-gray-500 text-lg font-light">Chargement des produits...</p>
          </div>
        ) : filtered.length > 0 ? (
          <section className="space-y-6">
            <header className="flex items-center justify-between">
              <h2 className="text-2xl font-light text-gray-900">
                {selectedCategory === 'all' 
                  ? 'Tous les produits' 
                  : selectedCategory === 'colliers' 
                    ? 'Tous les colliers'
                    : selectedCategory === 'harnais'
                      ? 'Tous les harnais'
                      : 'Toutes les laisses'}
              </h2>
              <div className="h-px w-16 bg-gray-900" aria-hidden="true" />
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((product) => (
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
          </section>
        ) : (
          <div className="text-center py-16" role="status" aria-live="polite">
            <p className="text-gray-500 text-lg font-light">Aucun produit pour ces filtres.</p>
          </div>
        )}
      </main>
      <ProductModal 
        product={selectedProduct} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
