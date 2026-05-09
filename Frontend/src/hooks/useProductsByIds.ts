import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchProductsByIds, type Product } from '../data/products';

// IMPORTANT — la dépendance d'effet est calculée à partir du contenu (clé string
// triée + jointe). Un appelant qui passerait `items.map(i => i.productId)` produit
// un nouveau tableau à chaque render : si on dépendait de la référence, l'effet
// rejouerait à chaque rendu et créerait une boucle infinie de fetch (vue en prod
// sous forme de 429 sur /api/products).
export function useProductsByIds(ids: number[]) {
  const idsKey = useMemo(
    () => [...ids].sort((a, b) => a - b).join(','),
    [ids]
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(ids.length > 0);

  // load reconstruit la liste d'ids à partir de la clé stable, ce qui évite
  // d'avoir à toucher à un ref pendant le render (interdit par react-hooks/refs).
  const load = useCallback(async () => {
    const currentIds = idsKey ? idsKey.split(',').map(Number).filter(n => !Number.isNaN(n)) : [];
    if (currentIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProductsByIds(currentIds);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [idsKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentIds = idsKey ? idsKey.split(',').map(Number).filter(n => !Number.isNaN(n)) : [];
      if (currentIds.length === 0) {
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const data = await fetchProductsByIds(currentIds);
        if (!cancelled) setProducts(data);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const getProduct = (id: number) => products.find(p => p.id === id);

  return { products, loading, getProduct, refetch: load };
}
