import { useState, useEffect } from 'react';
import { fetchProductsMinimalPaginated, type Product } from '../data/products';

/** Charge jusqu'à 100 produits pour les dropdowns admin (commandes, contre-propositions) */
export function useProductsListForAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { products: data } = await fetchProductsMinimalPaginated(1, 100);
        if (!cancelled) setProducts(data);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return { products, loading };
}
