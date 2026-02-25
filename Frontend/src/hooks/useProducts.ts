import { useState, useEffect } from 'react';
import { fetchProducts, getCachedProducts, type Product } from '../data/products';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(() => getCachedProducts() ?? []);
  const [loading, setLoading] = useState(() => !getCachedProducts());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = getCachedProducts();
    if (cached) {
      setProducts(cached);
      setLoading(false);
    }
    const loadProducts = async () => {
      try {
        if (!cached) setLoading(true);
        setError(null);
        const data = await fetchProducts();
        setProducts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement des produits');
        if (!cached) setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  return { products, loading, error };
}

