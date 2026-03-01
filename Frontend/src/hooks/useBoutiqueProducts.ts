import { useState, useEffect, useCallback } from 'react';
import { fetchProductsPaginated, type Product, type ProductCategory } from '../data/products';

const PRODUCTS_PER_PAGE = 12;

export function useBoutiqueProducts(filters: {
  category?: ProductCategory | 'all';
  collection?: string;
  color?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [collections, setCollections] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof fetchProductsPaginated>[0] = {
        page: p,
        limit: PRODUCTS_PER_PAGE,
        includeFilters: p === 1
      };
      if (filters.category && filters.category !== 'all') params.category = filters.category;
      if (filters.collection && filters.collection !== 'all') params.collection = filters.collection;
      if (filters.color && filters.color !== 'all') params.color = filters.color;
      const result = await fetchProductsPaginated(params);
      setProducts(result.products);
      setTotal(result.total);
      setPage(p);
      if (result.collections) setCollections(result.collections);
      if (result.colors) setColors(result.colors);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.collection, filters.color]);

  useEffect(() => {
    load(1);
  }, [load]);

  const goToPage = useCallback((p: number) => {
    load(p);
  }, [load]);

  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);

  return { products, total, page, totalPages, collections, colors, loading, error, goToPage, refetch: () => load(page) };
}
