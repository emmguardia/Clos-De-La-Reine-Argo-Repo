import { useState, useEffect, useCallback } from 'react';
import { fetchProductsByIds, type Product } from '../data/products';

export function useProductsByIds(ids: number[]) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProductsByIds(ids);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [ids.join(',')]);

  useEffect(() => {
    load();
  }, [load]);

  const getProduct = (id: number) => products.find(p => p.id === id);

  return { products, loading, getProduct, refetch: load };
}
