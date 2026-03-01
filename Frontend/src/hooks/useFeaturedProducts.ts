import { useState, useEffect } from 'react';
import { fetchFeaturedProducts, type Product } from '../data/products';

export function useFeaturedProducts(limit = 4) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFeaturedProducts(limit)
      .then(data => { if (!cancelled) setProducts(data); })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { products, loading };
}
