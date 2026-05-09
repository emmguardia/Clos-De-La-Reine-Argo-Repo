import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchProductsByIds, type Product } from '../data/products';

// IMPORTANT — la clé de dépendance ci-dessous est calculée à partir du contenu
// des IDs (triés + joints). Un appelant qui passerait `items.map(i => i.productId)`
// produit un nouveau tableau à chaque render : si on dépendait de la référence,
// le useEffect/useCallback rejouerait à chaque rendu, déclencherait setState et
// créerait une boucle infinie de fetch (observée en prod : 429 sur /api/products).
export function useProductsByIds(ids: number[]) {
  const idsKey = useMemo(
    () => [...ids].sort((a, b) => a - b).join(','),
    [ids]
  );
  const idsRef = useRef<number[]>(ids);
  idsRef.current = ids;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(ids.length > 0);

  const load = useCallback(async () => {
    const current = idsRef.current;
    if (current.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProductsByIds(current);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [idsKey, load]);

  const getProduct = (id: number) => products.find(p => p.id === id);

  return { products, loading, getProduct, refetch: load };
}
